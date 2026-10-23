/**
 * Application error carrying the HTTP status and a stable machine-readable code.
 *
 * Throwing this from a service keeps the service free of Express types while
 * still letting the error handler produce an accurate response.
 */
export class AppError extends Error {
  constructor(
    /** Stable identifier clients can branch on, e.g. `VALIDATION_FAILED`. */
    readonly code: string,
    message: string,
    readonly status: number = 500,
    /** Field-level detail, used for validation failures. */
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
