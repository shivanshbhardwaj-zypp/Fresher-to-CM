import pino from "pino";
import { config } from "./config.js";

/**
 * Structured JSON logger.
 *
 * Redaction is configured here rather than at call sites so that a newly added
 * log statement cannot accidentally leak the PII this form collects.
 */
export const logger = pino({
  level: config.isTest ? "silent" : config.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.phone",
      "*.address",
      "*.name",
      // The CM application also collects an email address and two free-text
      // answers that routinely contain identifying detail.
      "*.email",
      "*.emailNormalized",
      "*.phoneNormalized",
      "*.answer",
      "payload.phone",
      "payload.address",
      "payload.name",
      "payload.email",
    ],
    censor: "[redacted]",
  },
});
