import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { config } from "../../config.js";
import { isAppError } from "../../errors.js";
import { logger } from "../../logger.js";

/** Attaches a correlation id so a user-reported failure can be found in the logs. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.get("x-request-id") ?? randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

/** Flattens a Zod error into `{ fieldName: [messages] }` for the client. */
function fieldErrors(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.path}`,
      requestId: res.locals.requestId,
    },
  });
}

/**
 * Terminal error handler.
 *
 * Every response has the same shape, and internal failure details are never
 * sent to the client in production — only the correlation id, which ties the
 * user's report back to the full server-side log entry.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.locals.requestId;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "The submitted data is invalid",
        details: fieldErrors(err),
        requestId,
      },
    });
    return;
  }

  if (isAppError(err)) {
    // 4xx is the client's problem and expected; 5xx is ours and needs a stack.
    const level = err.status >= 500 ? "error" : "warn";
    logger[level]({ requestId, code: err.code, err: err.message }, "request failed");

    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  logger.error({ requestId, err }, "unhandled error");

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      requestId,
      ...(config.isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}
