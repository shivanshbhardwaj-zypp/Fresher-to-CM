import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../../config.js";
import { submitCmApplicationSchema } from "../../domain/cmApplication.js";
import type { Container } from "../../container.js";
import { logger } from "../../logger.js";

/**
 * Public "Bano Zypp Ke CM" intake.
 *
 * Unauthenticated and world-reachable, so it carries the rate limit and the
 * strictest validation. Nothing here trusts the client: the schema re-checks
 * every rule the browser already enforced, and the response shape is identical
 * whether the submission was stored, de-duplicated, or dropped as a bot.
 */
export function cmApplicationRoutes(container: Container): Router {
  const router = Router();

  const submitLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Tests would otherwise trip the limiter across cases.
    skip: () => config.isTest,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many applications from this network. Please try again later.",
      },
    },
  });

  router.post("/", submitLimiter, async (req, res, next) => {
    try {
      // Throws ZodError -> handled centrally as a 400 with per-field details.
      const input = submitCmApplicationSchema.parse(req.body);

      const result = await container.service.submit(input, {
        sourceIp: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      });

      // A bot gets the same 201 a real applicant would, so a filled honeypot
      // teaches it nothing. The id is synthetic; nothing was stored.
      if (result.outcome === "dropped") {
        logger.warn({ requestId: res.locals.requestId }, "cm application dropped: honeypot filled");
        res.status(201).json({
          data: { id: randomUUID(), status: "new", createdAt: new Date().toISOString() },
        });
        return;
      }

      const { application } = result;

      logger.info(
        {
          requestId: res.locals.requestId,
          applicationId: application.id,
          city: application.city,
          experience: application.experience,
          deduplicated: result.outcome === "deduplicated",
        },
        "cm application received",
      );

      // 200 on a dedupe hit, 201 on a genuinely new row.
      res.status(result.outcome === "deduplicated" ? 200 : 201).json({
        data: {
          id: application.id,
          status: application.status,
          createdAt: application.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
