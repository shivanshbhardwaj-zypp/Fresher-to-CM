/**
 * Intake for the "Bano Zypp Ke CM" campaign.
 *
 * Submissions go to a Google Apps Script web app that appends a row to the
 * applications sheet (apps-script/Code.gs). Its URL comes from
 * VITE_SHEETS_WEBAPP_URL in web/.env.local.
 */
const SHEETS_WEBAPP_URL = import.meta.env.VITE_SHEETS_WEBAPP_URL as string | undefined;

/** Machine values, deliberately not display strings — labels can be reworded freely. */
export type ExperienceLevel =
  | "studying"
  | "fresher"
  | "under_1_year"
  | "1_2_years"
  | "over_2_years";

/**
 * The cities Zypp operates hubs in. Machine values with separate labels, so
 * renaming "Bangalore" to "Bengaluru" on the form never invalidates a stored
 * application. Must stay in step with CITIES in the API's domain module.
 */
export const CITY_OPTIONS = [
  { value: "delhi", label: "Delhi" },
  { value: "gurgaon", label: "Gurgaon" },
  { value: "noida", label: "Noida" },
  { value: "jaipur", label: "Jaipur" },
  { value: "bangalore", label: "Bangalore" },
  { value: "mumbai", label: "Mumbai" },
  { value: "hyderabad", label: "Hyderabad" },
  { value: "lucknow", label: "Lucknow" },
  { value: "chennai", label: "Chennai" },
  { value: "chandigarh", label: "Chandigarh" },
] as const;

export type City = (typeof CITY_OPTIONS)[number]["value"];

export interface CmApplicationFormData {
  name: string;
  phone: string;
  email: string;
  city: City | "";
  experience: ExperienceLevel | "";
  degree: string;
  college?: string;
  previousExperience?: string;
  link?: string;
  /** One answer covering both "why you" and "what would you fix first". */
  answer: string;
  /** Audio or video pitch hosted elsewhere; stands in for the written answer. */
  mediaLink?: string;
  /** Honeypot. Always empty for a human; the server drops anything that fills it. */
  company?: string;
}

export interface CmApplicationResponse {
  ok: boolean;
  status: number;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * A failed submission, carrying enough detail for the form to paint per-field
 * errors rather than one generic banner.
 */
export class CmApplicationError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Field name -> messages, present on validation failures. */
    readonly details?: Record<string, string[]>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "CmApplicationError";
  }
}

/** A hung request must not leave the submit button disabled forever. */
const REQUEST_TIMEOUT_MS = 15000;

export const cmApplicationService = {
  submitApplication: async (formData: CmApplicationFormData): Promise<CmApplicationResponse> => {
    if (!SHEETS_WEBAPP_URL) throw new CmApplicationError(0, "Applications aren't open yet.");

    let body: CmApplicationResponse;
    try {
      // text/plain keeps this a "simple" request: Apps Script can't answer a CORS preflight.
      const response = await fetch(SHEETS_WEBAPP_URL, {
        method: "POST",
        body: JSON.stringify(formData),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      body = await response.json();
    } catch {
      // Offline, DNS failure, timeout, or a non-JSON reply — no usable answer.
      throw new CmApplicationError(0, "Check your connection and try again.");
    }

    if (!body.ok) throw new CmApplicationError(body.status, body.message || "That didn't send.", body.details);
    return body;
  },
};
