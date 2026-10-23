/**
 * Contact-detail normalisation shared by every intake form.
 *
 * Lives apart from the application's domain module so every place that touches
 * a phone number agrees on what "the same number" means — two different answers
 * to that question would let one person appear as two applicants.
 */

/** Indian mobile numbers are 10 digits and never start with 0-5. */
export const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Keeps the last 10 digits so `+91 98765 43210` and `09876543210` unify. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export function isIndianMobile(raw: string): boolean {
  return INDIAN_MOBILE.test(normalizePhone(raw));
}

/**
 * Case-folds an address for duplicate detection.
 *
 * Deliberately does NOT strip dots or `+tags`: that is Gmail-specific
 * behaviour, and applying it universally would merge two genuinely different
 * people at providers where those characters are significant. The address as
 * typed is stored separately and is what we reply to.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
