import { Router } from "express";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import type { Container } from "../../container.js";

/**
 * Liveness and readiness.
 *
 * Liveness answers "is the process up" and must stay dependency-free, or a
 * database blip would get the container killed instead of drained.
 * Readiness answers "can it serve traffic" and does check the database.
 */
export function healthRoutes(container: Container): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get("/live", (_req, res) => {
    res.json({ status: "ok", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) });
  });

  router.get("/ready", async (_req, res) => {
    try {
      // Round-trips to MongoDB rather than trusting the cached connection.
      await container.db.command({ ping: 1 });
      res.json({ status: "ready", checks: { database: "ok" } });
    } catch (error) {
      // Driver errors can name hosts and replica-set members; that belongs in
      // the logs, not in an unauthenticated response.
      logger.error({ err: error }, "readiness check failed");
      res.status(503).json({
        status: "unavailable",
        checks: { database: "failed" },
        ...(config.isProduction ? {} : { error: error instanceof Error ? error.message : String(error) }),
      });
    }
  });

  return router;
}
