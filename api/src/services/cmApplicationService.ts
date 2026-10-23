import type { MongoClient } from "mongodb";
import { withTransaction } from "../db/mongo.js";
import { normalizeEmail, normalizePhone } from "../domain/contact.js";
import {
  canTransition,
  isWithinTargetExperience,
  type ApplicationStatus,
  type CmApplicationRecord,
  type SubmitCmApplicationInput,
} from "../domain/cmApplication.js";
import {
  DuplicateApplicationError,
  type CmApplicationRepository,
  type ListFilters,
} from "../repositories/cmApplicationRepo.js";
import type { OutboxRepository } from "../repositories/outboxRepo.js";
import { AppError } from "../errors.js";

/**
 * A resubmission within this window is the same person double-tapping submit,
 * not a second application. Beyond it, a repeat is a genuine duplicate and is
 * refused so one candidate cannot occupy two slots in the funnel.
 */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export interface SubmissionContext {
  sourceIp: string | null;
  userAgent: string | null;
}

/**
 * Discriminated so the route never has to guess what happened:
 *   created       — a new row exists
 *   deduplicated  — the same submission arrived twice in quick succession
 *   dropped       — the honeypot was filled; nothing was stored
 */
export type SubmissionResult =
  | { outcome: "created"; application: CmApplicationRecord }
  | { outcome: "deduplicated"; application: CmApplicationRecord }
  | { outcome: "dropped" };

/**
 * Business logic for CM applications.
 *
 * Dependencies are injected so this can be exercised against an in-memory
 * MongoDB with no HTTP layer involved.
 */
export class CmApplicationService {
  constructor(
    private readonly client: MongoClient,
    private readonly applications: CmApplicationRepository,
    private readonly outbox: OutboxRepository,
    /** Injected for deterministic tests. */
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Persists an application and enqueues its notification in one transaction.
   *
   * Either both land or neither does — a notification can never reference an
   * application that was rolled back, and an accepted application can never
   * silently skip notification. Requires a replica set; see `db/mongo.ts`.
   */
  async submit(input: SubmitCmApplicationInput, context: SubmissionContext): Promise<SubmissionResult> {
    // A human never sees this field, so a value in it means a bot filled every
    // input on the page. Answer as if accepted; store nothing.
    if (input.company?.trim()) {
      return { outcome: "dropped" };
    }

    const now = this.clock();
    const nowIso = now.toISOString();
    const emailNormalized = normalizeEmail(input.email);
    const phoneNormalized = normalizePhone(input.phone);

    try {
      return await withTransaction(this.client, async (session) => {
        const application = await this.applications.create(
          {
            name: input.name,
            email: input.email,
            emailNormalized,
            phone: input.phone,
            phoneNormalized,
            city: input.city,
            experience: input.experience,
            // Empty string means "not provided" — store null, not "".
            linkUrl: input.link?.trim() || null,
            answer: input.answer,
            sourceIp: context.sourceIp,
            userAgent: context.userAgent,
          },
          nowIso,
          session,
        );

        // Payload carries no PII: outbox events reach the logs and whatever
        // channel is configured. Anything needing the applicant's details reads
        // the record back by id.
        await this.outbox.enqueue(
          "cm_application.created",
          {
            applicationId: application.id,
            city: application.city,
            experience: application.experience,
            withinTargetExperience: isWithinTargetExperience(application.experience),
            createdAt: application.createdAt,
          },
          nowIso,
          session,
        );

        return { outcome: "created" as const, application };
      });
    } catch (error) {
      if (error instanceof DuplicateApplicationError) {
        return this.resolveDuplicate(error, emailNormalized, phoneNormalized, now);
      }
      throw error;
    }
  }

  /**
   * Decides what a unique-index rejection means for the applicant.
   *
   * The index is what makes this race-safe: two concurrent submissions both
   * pass any read-based check, but only one insert survives, and the loser
   * lands here and is told the truth.
   */
  private async resolveDuplicate(
    error: DuplicateApplicationError,
    emailNormalized: string,
    phoneNormalized: string,
    now: Date,
  ): Promise<SubmissionResult> {
    const existing =
      error.field === "phone"
        ? await this.applications.findByPhone(phoneNormalized)
        : await this.applications.findByEmail(emailNormalized);

    // Deleted between the failed insert and this read. Nothing useful to add.
    if (!existing) {
      throw new AppError("ALREADY_APPLIED", "You have already applied to this programme", 409);
    }

    // A double-tapped submit button, not a second application.
    const age = now.getTime() - new Date(existing.createdAt).getTime();
    if (age <= DUPLICATE_WINDOW_MS) {
      return { outcome: "deduplicated", application: existing };
    }

    throw new AppError(
      "ALREADY_APPLIED",
      error.field === "phone"
        ? "An application already exists for this phone number. One application per person."
        : "An application already exists for this email address. One application per person.",
      409,
      { [error.field]: ["You have already applied — we have your application."] },
    );
  }

  async getById(id: string): Promise<CmApplicationRecord> {
    const application = await this.applications.findById(id);
    if (!application) {
      throw new AppError("NOT_FOUND", "Application not found", 404);
    }
    return application;
  }

  async list(filters: ListFilters): Promise<{ items: CmApplicationRecord[]; nextCursor: string | null }> {
    const items = await this.applications.list(filters);
    const nextCursor = items.length === filters.limit ? items[items.length - 1].createdAt : null;
    return { items, nextCursor };
  }

  /** Applies a reviewer decision, rejecting transitions the funnel disallows. */
  async updateStatus(
    id: string,
    status: ApplicationStatus,
    reviewNotes: string | null,
  ): Promise<CmApplicationRecord> {
    const current = await this.getById(id);

    if (current.status === status) return current;

    if (!canTransition(current.status, status)) {
      throw new AppError(
        "INVALID_TRANSITION",
        `Cannot change status from '${current.status}' to '${status}'`,
        409,
      );
    }

    return withTransaction(this.client, async (session) => {
      const nowIso = this.clock().toISOString();
      const updated = (await this.applications.updateStatus(id, status, reviewNotes, nowIso, session))!;

      await this.outbox.enqueue(
        "cm_application.status_changed",
        { applicationId: id, from: current.status, to: status },
        nowIso,
        session,
      );

      return updated;
    });
  }

  async stats(): Promise<Record<string, number>> {
    return this.applications.countByStatus();
  }
}
