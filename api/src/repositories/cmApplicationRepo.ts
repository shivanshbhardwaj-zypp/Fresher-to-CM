import { randomUUID } from "node:crypto";
import type { ClientSession, Db, Collection, MongoServerError } from "mongodb";
import { COLLECTIONS } from "../db/mongo.js";
import type {
  ApplicationStatus,
  CmApplicationRecord,
  City,
  ExperienceLevel,
} from "../domain/cmApplication.js";

/**
 * Data access for CM applications.
 *
 * Constructed with a `Db` rather than importing a singleton, so tests can hand
 * it an in-memory MongoDB.
 */

/**
 * Stored document shape. `_id` holds a UUID we generate rather than an
 * ObjectId, keeping ids opaque and stable in API responses.
 *
 * Timestamps are ISO-8601 UTC strings, which sort lexicographically — that is
 * what lets keyset pagination use `createdAt` directly as its cursor.
 */
interface ApplicationDoc {
  _id: string;
  name: string;
  email: string;
  emailNormalized: string;
  phone: string;
  phoneNormalized: string;
  city: City;
  experience: ExperienceLevel;
  linkUrl: string | null;
  answer: string;
  status: ApplicationStatus;
  reviewNotes: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRecord(doc: ApplicationDoc): CmApplicationRecord {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export interface CreateCmApplicationData {
  name: string;
  email: string;
  emailNormalized: string;
  phone: string;
  phoneNormalized: string;
  city: City;
  experience: ExperienceLevel;
  linkUrl: string | null;
  answer: string;
  sourceIp: string | null;
  userAgent: string | null;
}

export interface ListFilters {
  status?: ApplicationStatus;
  limit: number;
  /** Keyset cursor: the `createdAt` of the last row from the previous page. */
  cursor?: string;
}

/**
 * Raised when a unique index rejects an insert.
 *
 * This is the authoritative duplicate check. A read-then-write in the service
 * would leave a window where two concurrent submissions both see "no existing
 * application" and both insert — the index closes it, and this error is how
 * that outcome reaches the service layer.
 */
export class DuplicateApplicationError extends Error {
  constructor(readonly field: "email" | "phone") {
    super(`An application already exists with this ${field}`);
    this.name = "DuplicateApplicationError";
  }
}

/** MongoDB's duplicate-key error code. */
const DUPLICATE_KEY = 11000;

function asDuplicateError(error: unknown): DuplicateApplicationError | null {
  const candidate = error as MongoServerError;
  if (candidate?.code !== DUPLICATE_KEY) return null;

  const key = Object.keys(candidate.keyPattern ?? {})[0];
  return new DuplicateApplicationError(key === "phoneNormalized" ? "phone" : "email");
}

export class CmApplicationRepository {
  private readonly col: Collection<ApplicationDoc>;

  constructor(db: Db) {
    this.col = db.collection<ApplicationDoc>(COLLECTIONS.cmApplications);
  }

  /** @throws {DuplicateApplicationError} when the email or phone is already registered. */
  async create(
    data: CreateCmApplicationData,
    now: string = new Date().toISOString(),
    session?: ClientSession,
  ): Promise<CmApplicationRecord> {
    const doc: ApplicationDoc = {
      _id: randomUUID(),
      ...data,
      status: "new",
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.col.insertOne(doc, { session });
    } catch (error) {
      const duplicate = asDuplicateError(error);
      if (duplicate) throw duplicate;
      throw error;
    }

    return toRecord(doc);
  }

  async findById(id: string): Promise<CmApplicationRecord | null> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? toRecord(doc) : null;
  }

  async findByEmail(emailNormalized: string): Promise<CmApplicationRecord | null> {
    const doc = await this.col.findOne({ emailNormalized });
    return doc ? toRecord(doc) : null;
  }

  async findByPhone(phoneNormalized: string): Promise<CmApplicationRecord | null> {
    const doc = await this.col.findOne({ phoneNormalized });
    return doc ? toRecord(doc) : null;
  }

  /**
   * Keyset pagination — stays fast however deep the caller pages, unlike
   * skip() which walks past every skipped document.
   */
  async list(filters: ListFilters): Promise<CmApplicationRecord[]> {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.cursor) query.createdAt = { $lt: filters.cursor };

    const docs = await this.col.find(query).sort({ createdAt: -1 }).limit(filters.limit).toArray();
    return docs.map(toRecord);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.col
      .aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }])
      .toArray();

    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  async updateStatus(
    id: string,
    status: ApplicationStatus,
    reviewNotes: string | null,
    now: string = new Date().toISOString(),
    session?: ClientSession,
  ): Promise<CmApplicationRecord | null> {
    const doc = await this.col.findOneAndUpdate(
      { _id: id },
      { $set: { status, reviewNotes, updatedAt: now } },
      { returnDocument: "after", session },
    );

    return doc ? toRecord(doc) : null;
  }
}
