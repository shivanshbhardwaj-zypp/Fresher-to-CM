import express, { type Express, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { Container } from "./container.js";
import { errorHandler, notFoundHandler, requestContext } from "./api/middleware/errorHandler.js";
import { cmApplicationRoutes } from "./api/routes/cmApplications.js";
import { adminRoutes } from "./api/routes/admin.js";
import { healthRoutes } from "./api/routes/health.js";

/**
 * Builds the Express app.
 *
 * Takes a `Container` so tests can mount the same app over an in-memory
 * database without booting a real server or touching disk.
 *
 * Routes are mounted at the root (`/api/...`). In production nginx strips the
 * `/bano-zypp-ke-cm` prefix before proxying, so this process never needs to
 * know where it sits in the public URL space — see deploy/nginx.conf.
 */
export function createApp(container: Container): Express {
  const app = express();

  // Set to the real number of proxies in front of this process. Trusting more
  // hops than actually exist lets a client spoof X-Forwarded-For and pick its
  // own rate-limit bucket; trusting fewer collapses everyone behind the proxy
  // into a single IP, so one submitter can lock out the whole internet.
  if (config.TRUST_PROXY > 0) app.set("trust proxy", config.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(requestContext);

  if (!config.isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (_req: unknown, res: unknown) => (res as Response).locals.requestId as string,
        // Health checks would otherwise dominate the logs.
        autoLogging: { ignore: (req: unknown) => (req as Request).url?.startsWith("/health") ?? false },
      }),
    );
  }

  // Minimal security headers. The full CSP belongs on nginx, which serves the
  // HTML — see deploy/nginx.conf.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  // Explicit origin allowlist — never reflects an arbitrary Origin header.
  // Largely inert in the intended deployment, where the page and the API share
  // the zypp.app origin and no preflight ever happens.
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-Id");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Bounded body: the largest legitimate application is a few KB.
  app.use(express.json({ limit: "64kb" }));

  // Service descriptor. Opening the API root in a browser is a common way to
  // check "is it up?" — answer that instead of a bare 404.
  app.get("/", (_req, res) => {
    res.json({
      service: "bano-zypp-ke-cm-api",
      status: "ok",
      endpoints: {
        health: ["GET /health/live", "GET /health/ready"],
        public: ["POST /api/cm-applications"],
        admin: [
          "GET /api/admin/applications",
          "GET /api/admin/applications/:id",
          "PATCH /api/admin/applications/:id/status",
          "GET /api/admin/stats",
        ],
      },
    });
  });

  app.use("/health", healthRoutes(container));
  app.use("/api/cm-applications", cmApplicationRoutes(container));
  app.use("/api/admin", adminRoutes(container));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
