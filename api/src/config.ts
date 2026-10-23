import "dotenv/config";
import { z } from "zod";

/**
 * Environment configuration, validated once at boot.
 * Fails fast with a readable error rather than surfacing `undefined` deep in a
 * request.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  /**
   * MongoDB connection string. Must point at a replica set (Atlas is one by
   * default) — a standalone server cannot run the outbox transaction.
   */
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().default("bano_zypp_ke_cm"),

  /** Bearer token guarding /api/admin/*. Required outside development. */
  ADMIN_TOKEN: z.string().min(16).optional(),

  /**
   * Comma-separated browser origins allowed to call the API.
   *
   * In the intended deployment this list is barely used: nginx serves the page
   * and proxies the API under the same origin (zypp.app), so requests are
   * same-origin and never preflight. It matters only if the API is ever moved
   * to its own host.
   */
  CORS_ORIGINS: z.string().default("https://zypp.app,http://localhost:5173"),

  /**
   * How many proxies sit in front of this process. nginx in front of the
   * container means 1. Getting this wrong makes the rate limiter either trust
   * a spoofable header or bucket the entire internet into one IP.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  /** Public submission rate limit, per IP. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),

  /** Comma-separated: any of `log`, `webhook`. */
  NOTIFY_CHANNEL: z.string().default("log"),
  NOTIFY_WEBHOOK_URL: z.string().url().optional(),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  notifyChannels: parsed.data.NOTIFY_CHANNEL.split(",")
    .map((channel) => channel.trim().toLowerCase())
    .filter(Boolean),
};

// A production deploy without an admin token would leave the admin API
// unauthenticated — every application readable by anyone who guesses the path.
if (config.isProduction && !config.ADMIN_TOKEN) {
  console.error("ADMIN_TOKEN is required when NODE_ENV=production.");
  process.exit(1);
}

if (config.notifyChannels.includes("webhook") && !config.NOTIFY_WEBHOOK_URL) {
  console.error("NOTIFY_WEBHOOK_URL is required when NOTIFY_CHANNEL includes 'webhook'.");
  process.exit(1);
}
