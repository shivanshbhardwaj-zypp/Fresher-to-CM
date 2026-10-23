import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";
import { AppError } from "../../errors.js";

/** Constant-time comparison so a wrong token can't be discovered byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Bearer-token guard for the admin API.
 *
 * Fails closed: if no ADMIN_TOKEN is configured the route is refused rather
 * than left open. (`config.ts` already hard-fails this case in production.)
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const expected = config.ADMIN_TOKEN;

  if (!expected) {
    next(new AppError("ADMIN_DISABLED", "Admin API is not configured on this server", 503));
    return;
  }

  const header = req.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token || !safeEqual(token, expected)) {
    next(new AppError("UNAUTHORIZED", "Valid admin credentials are required", 401));
    return;
  }

  next();
}
