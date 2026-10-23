import { z } from "zod";
import { isIndianMobile } from "./contact.js";
import { multiLine, singleLine } from "./text.js";

/**
 * Domain rules for a "Bano Zypp Ke CM" application.
 *
 * Everything here is a pure function or a schema — no database, no HTTP, no
 * clock — so the rules are testable on their own and shared by the public
 * endpoint and the admin tooling.
 */

/**
 * Experience bands.
 *
 * Stable machine values, NOT display strings. An enum that has to stay
 * byte-identical to the frontend's labels is one em dash away from silently
 * rejecting every submission. Labels live in `EXPERIENCE_LABELS` and can be
 * reworded freely.
 */
export const EXPERIENCE_LEVELS = [
  "studying",
  "fresher",
  "under_1_year",
  "1_2_years",
  "over_2_years",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  studying: "Still studying",
  fresher: "Fresher — 0 years",
  under_1_year: "Under 1 year",
  "1_2_years": "1–2 years",
  over_2_years: "More than 2 years",
};

/**
 * The cities Zypp currently operates hubs in.
 *
 * Machine values with separate labels, same reasoning as the experience bands:
 * "Bangalore" becoming "Bengaluru" on the form should be a label edit, not a
 * migration of every stored application.
 *
 * A closed set rather than free text also means a reviewer never has to
 * reconcile "Gurgaon", "gurgaon" and "Gurugram" by hand.
 */
export const CITIES = [
  "delhi",
  "gurgaon",
  "noida",
  "jaipur",
  "bangalore",
  "mumbai",
  "hyderabad",
  "lucknow",
  "chennai",
  "chandigarh",
] as const;
export type City = (typeof CITIES)[number];

export const CITY_LABELS: Record<City, string> = {
  delhi: "Delhi",
  gurgaon: "Gurgaon",
  noida: "Noida",
  jaipur: "Jaipur",
  bangalore: "Bangalore",
  mumbai: "Mumbai",
  hyderabad: "Hyderabad",
  lucknow: "Lucknow",
  chennai: "Chennai",
  chandigarh: "Chandigarh",
};

/** Hiring funnel states. */
export const APPLICATION_STATUSES = [
  "new",
  "shortlisted",
  "interviewing",
  "selected",
  "rejected",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * The programme is open to freshers and up to ~2 years of experience. More
 * experience is not rejected outright — it is recorded and flagged, because
 * that decision belongs to a reviewer, not to a dropdown.
 */
export function isWithinTargetExperience(level: ExperienceLevel): boolean {
  return level !== "over_2_years";
}

/**
 * The answer that actually decides shortlists, so it has a real floor. Short
 * enough that a genuine two-sentence answer passes, long enough that
 * "i will fix everything" does not.
 */
export const MIN_ANSWER_CHARS = 60;
export const MAX_ANSWER_CHARS = 2000;

/** Cleans a one-line field, then validates the cleaned value's length. */
function line(min: number, max: number, message: string) {
  return z
    .string()
    .transform(singleLine)
    .pipe(z.string().min(min, message).max(max, `Keep this under ${max} characters`));
}

/** Cleans a free-text answer, preserving paragraph breaks. */
function prose(min: number, max: number, message: string) {
  return z
    .string()
    .transform(multiLine)
    .pipe(z.string().min(min, message).max(max, `Keep this under ${max} characters`));
}

/**
 * Public submission schema — the trust boundary.
 *
 * Re-validates everything the browser already checks: the client-side rules are
 * UX, these are the rules. `strictObject` rejects unknown keys outright, so a
 * crafted body cannot smuggle in a field (`status`, `reviewNotes`) that the
 * client has no business setting.
 */
export const submitCmApplicationSchema = z.strictObject({
  name: line(2, 120, "Enter your full name"),

  email: z
    .string()
    .transform(singleLine)
    // RFC 5321 caps an address at 254 characters. Length is checked before the
    // format rule so a megabyte-long string fails cheaply.
    .pipe(z.string().max(254, "That email address is too long"))
    .pipe(z.email("Enter a valid email address")),

  phone: z
    .string()
    .transform(singleLine)
    .pipe(
      z
        .string()
        .min(1, "Phone number is required")
        .refine(isIndianMobile, "Enter a valid 10-digit Indian mobile number"),
    ),

  city: z.enum(CITIES, { message: "Select a city" }),

  experience: z.enum(EXPERIENCE_LEVELS, { message: "Select your experience level" }),

  /**
   * Optional LinkedIn or portfolio link. Restricted to http(s) so a stored
   * value can never be a `javascript:` or `data:` URI that an admin UI might
   * later render as a clickable link.
   */
  link: z
    .union([z.literal(""), z.url({ message: "Enter a valid link" })])
    .optional()
    .refine((value) => !value || /^https?:\/\//i.test(value), "Link must start with http:// or https://"),

  /**
   * One written answer covering both "why you" and "what would you fix".
   *
   * Deliberately a single field: the campaign brief scores this text on the
   * specificity of the fix at 50% of the total, so it must be sortable and
   * searchable.
   */
  answer: prose(
    MIN_ANSWER_CHARS,
    MAX_ANSWER_CHARS,
    `Be specific — at least ${MIN_ANSWER_CHARS} characters`,
  ),

  /**
   * Honeypot. A real applicant never sees this field, so anything in it came
   * from a bot filling every input on the page. It is declared here rather than
   * left to `strictObject` so the request is not 400'd — the service drops the
   * submission and still answers 201, giving the bot nothing to learn. This is
   * inbox hygiene, not a security control; the rate limiter is the control.
   */
  company: z.string().max(200).optional(),
});

export type SubmitCmApplicationInput = z.infer<typeof submitCmApplicationSchema>;

/** A stored application, as returned by the repository. */
export interface CmApplicationRecord {
  id: string;
  name: string;
  email: string;
  emailNormalized: string;
  phone: string;
  phoneNormalized: string;
  city: City;
  experience: ExperienceLevel;
  linkUrl: string | null;
  answer: string;
  status: ApplicationStatus;
  reviewNotes: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Legal status transitions. Prevents a selected candidate being flipped back to
 * `new` by a stray API call, while keeping `rejected` reversible for the case
 * where a reviewer changes their mind.
 */
const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  new: ["shortlisted", "rejected"],
  shortlisted: ["interviewing", "rejected"],
  interviewing: ["selected", "rejected"],
  selected: [],
  rejected: ["shortlisted"],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
