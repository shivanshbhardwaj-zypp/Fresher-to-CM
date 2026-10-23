import { Router } from "express";
import { z } from "zod";
import {
  APPLICATION_STATUSES,
  EXPERIENCE_LABELS,
  isWithinTargetExperience,
} from "../../domain/cmApplication.js";
import type { CmApplicationRecord } from "../../domain/cmApplication.js";
import type { Container } from "../../container.js";
import { requireAdmin } from "../middleware/auth.js";

/**
 * Reviewer-facing API. Everything here sits behind `requireAdmin`, which does a
 * constant-time comparison against ADMIN_TOKEN.
 */

const listQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  reviewNotes: z.string().trim().max(2000).optional(),
});

/**
 * Resolves the experience code to its label here rather than in the client, so
 * the wording can change without a frontend deploy, and flags applicants
 * outside the programme's target band for the reviewer's attention.
 */
function present(record: CmApplicationRecord) {
  return {
    ...record,
    experienceLabel: EXPERIENCE_LABELS[record.experience],
    withinTargetExperience: isWithinTargetExperience(record.experience),
  };
}

export function adminRoutes(container: Container): Router {
  const router = Router();

  router.use(requireAdmin);

  router.get("/applications", async (req, res, next) => {
    try {
      const { status, limit, cursor } = listQuerySchema.parse(req.query);
      const { items, nextCursor } = await container.service.list({ status, limit, cursor });

      res.json({ data: items.map(present), pagination: { nextCursor, limit } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/applications/:id", async (req, res, next) => {
    try {
      res.json({ data: present(await container.service.getById(req.params.id)) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/applications/:id/status", async (req, res, next) => {
    try {
      const { status, reviewNotes } = updateStatusSchema.parse(req.body);
      const updated = await container.service.updateStatus(req.params.id, status, reviewNotes ?? null);

      res.json({ data: present(updated) });
    } catch (error) {
      next(error);
    }
  });

  /** Operational counts — funnel state plus outbox backlog. */
  router.get("/stats", async (_req, res, next) => {
    try {
      const [applications, outbox] = await Promise.all([
        container.service.stats(),
        container.outbox.countByStatus(),
      ]);

      res.json({ data: { applications, outbox } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
