import { useRef, useState, type FormEvent } from "react";
import {
  cmApplicationService,
  CmApplicationError,
  CITY_OPTIONS,
  type CmApplicationFormData,
} from "../services/cmApplicationService";

/**
 * "Bano Zypp Ke CM" application form.
 *
 * Validation here is UX only — the server re-checks every rule and is the
 * authority on what is accepted. What this component owes the applicant is
 * that a submission is never silently lost: every outcome, including a network
 * failure, ends in a message, a usable form, and the typed answers still there.
 */

const SUPPORT_EMAIL = "careers@zypp.app";

const ANSWER_LIMIT = 2000;

const EXPERIENCE_OPTIONS = [
  { value: "studying", label: "Still studying" },
  { value: "fresher", label: "Fresher — 0 years" },
  { value: "under_1_year", label: "Under 1 year" },
  { value: "1_2_years", label: "1–2 years" },
  { value: "over_2_years", label: "More than 2 years" },
];

const EMPTY: CmApplicationFormData = {
  name: "",
  phone: "",
  email: "",
  city: "",
  experience: "",
  degree: "",
  college: "",
  previousExperience: "",
  link: "",
  answer: "",
  mediaLink: "",
  /** Honeypot — see the hidden field near the bottom of the form. */
  company: "",
};

type FieldName = keyof typeof EMPTY;

interface Status {
  kind: "success" | "error";
  headline: string;
  detail: string;
  /** Shown only when sending failed outright, so there is always a way through. */
  offerSupport?: boolean;
}

/** `{ phone: ["a", "b"] }` -> `{ phone: "a b" }` for display in one slot. */
const flattenDetails = (details: Record<string, string[]>): Record<string, string> =>
  Object.fromEntries(Object.entries(details).map(([field, msgs]) => [field, msgs.join(" ")]));

const CmApplyForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<CmApplicationFormData>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: FieldName) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  /** Moves focus to the first field the server (or the browser) rejected. */
  const focusField = (name?: string) => {
    if (!name) return;
    const field = formRef.current?.elements.namedItem(name);
    if (field instanceof HTMLElement) field.focus();
  };

  /** Mirrors the browser's own constraint messages into our error slots. */
  const collectNativeErrors = (form: HTMLFormElement): Record<string, string> => {
    const errors: Record<string, string> = {};
    Array.from(form.elements).forEach((field) => {
      const isField =
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement;
      if (isField && !field.validity.valid) errors[field.name] = field.validationMessage;
    });
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;

    setStatus(null);
    setFieldErrors({});

    if (!form.checkValidity()) {
      const native = collectNativeErrors(form);
      setFieldErrors(native);
      focusField(Object.keys(native)[0]);
      return;
    }

    setSubmitting(true);

    try {
      await cmApplicationService.submitApplication(values);
      setValues(EMPTY);
      setStatus({
        kind: "success",
        headline: "Application received.",
        detail:
          "You'll hear from the team within 7 days. Check your email and WhatsApp — including spam.",
      });
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      if (!(error instanceof CmApplicationError)) throw error;

      if (error.status === 400 && error.details) {
        const flattened = flattenDetails(error.details);
        setFieldErrors(flattened);
        focusField(Object.keys(flattened)[0]);
        setStatus({ kind: "error", headline: "Check the highlighted fields.", detail: error.message });
        return;
      }

      if (error.status === 409) {
        if (error.details) setFieldErrors(flattenDetails(error.details));
        setStatus({ kind: "error", headline: "You've already applied.", detail: error.message });
        return;
      }

      if (error.status === 429) {
        setStatus({ kind: "error", headline: "Too many attempts.", detail: error.message });
        return;
      }

      setStatus({
        kind: "error",
        headline: "That didn't send.",
        detail: error.requestId ? `Please try again. Reference: ${error.requestId}.` : error.message,
        offerSupport: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  /** Identity, value binding and invalid flag, wired the same way for every field. */
  const fieldProps = (name: FieldName) => ({
    id: name,
    name,
    value: values[name] as string,
    onChange: set(name),
    "aria-invalid": fieldErrors[name] ? true : undefined,
  });

  const ErrorSlot = ({ name }: { name: FieldName }) => (
    <p className={`field-error ${fieldErrors[name] ? "is-shown" : ""}`} id={`${name}-error`}>
      <span>{fieldErrors[name] ?? ""}</span>
    </p>
  );

  return (
    <form ref={formRef} id="apply-form" onSubmit={handleSubmit} noValidate>
      <div className="grid2">
        <div className="field">
          <label htmlFor="name">
            Full name{" "}
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            {...fieldProps("name")}
            type="text"
            required
            autoComplete="name"
            maxLength={120}
            aria-describedby="name-error"
          />
          <ErrorSlot name="name" />
        </div>

        <div className="field">
          <label htmlFor="phone">
            Phone (WhatsApp){" "}
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            {...fieldProps("phone")}
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            maxLength={20}
            aria-describedby="phone-hint phone-error"
          />
          <span className="hint" id="phone-hint">
            10-digit Indian mobile number.
          </span>
          <ErrorSlot name="phone" />
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label htmlFor="email">
            Email{" "}
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            {...fieldProps("email")}
            type="email"
            required
            autoComplete="email"
            maxLength={254}
            aria-describedby="email-error"
          />
          <ErrorSlot name="email" />
        </div>

        <div className="field">
          <label htmlFor="city">
            City you can work in{" "}
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <select {...fieldProps("city")} required aria-describedby="city-error">
            <option value="">Select</option>
            {CITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ErrorSlot name="city" />
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label htmlFor="experience">
            Experience{" "}
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <select {...fieldProps("experience")} required aria-describedby="experience-error">
            <option value="">Select</option>
            {EXPERIENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ErrorSlot name="experience" />
        </div>

        <div className="field">
          <label htmlFor="link">LinkedIn or portfolio link</label>
          <input
            {...fieldProps("link")}
            type="url"
            placeholder="https://"
            maxLength={500}
            aria-describedby="link-hint link-error"
          />
          <span className="hint" id="link-hint">
            Optional. A link is fine — don't attach a resume.
          </span>
          <ErrorSlot name="link" />
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label htmlFor="degree">
            Degree{" "}
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            {...fieldProps("degree")}
            type="text"
            required
            placeholder="e.g. B.Com, BBA, B.Tech, 12th"
            maxLength={120}
            aria-describedby="degree-hint degree-error"
          />
          <span className="hint" id="degree-hint">
            Your highest qualification. No degree? Write 12th, 10th or Diploma.
          </span>
          <ErrorSlot name="degree" />
        </div>

        <div className="field">
          <label htmlFor="college">College</label>
          <input
            {...fieldProps("college")}
            type="text"
            placeholder="e.g. Delhi University"
            autoComplete="organization"
            maxLength={160}
            aria-describedby="college-hint college-error"
          />
          <span className="hint" id="college-hint">
            Optional. Where you study or last studied.
          </span>
          <ErrorSlot name="college" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="previousExperience">Previous experience</label>
        <span className="hint" id="previousExperience-hint">
          Optional. Jobs, internships, side hustles — anything where you got people to sign up or show up.
        </span>
        <textarea
          {...fieldProps("previousExperience")}
          className="textarea--short"
          maxLength={1000}
          aria-describedby="previousExperience-hint previousExperience-error"
        />
        <ErrorSlot name="previousExperience" />
      </div>

      <div className="field">
        <label htmlFor="answer">
          Why you? And if you think you can onboard riders, convince us how.{" "}
          <span className="req" aria-hidden="true">
            *
          </span>
        </label>
        <span className="hint" id="answer-hint">
          Write it here, or record an audio or video and share the link below — either one works.
          Talk to a few delivery riders first and tell us your plan. This is what decides shortlists.
        </span>
        <textarea
          {...fieldProps("answer")}
          required={!values.mediaLink}
          minLength={values.mediaLink ? undefined : 60}
          maxLength={ANSWER_LIMIT}
          aria-describedby="answer-hint answer-count answer-error"
        />
        <p
          className={`count ${values.answer.length > ANSWER_LIMIT * 0.9 ? "is-near-limit" : ""}`}
          id="answer-count"
        >
          {values.answer.length} / {ANSWER_LIMIT}
        </p>
        <ErrorSlot name="answer" />
      </div>

      <div className="field">
        <label htmlFor="mediaLink">Audio or video link</label>
        <input
          {...fieldProps("mediaLink")}
          type="url"
          placeholder="https://"
          maxLength={500}
          aria-describedby="mediaLink-hint mediaLink-error"
        />
        <span className="hint" id="mediaLink-hint">
          Optional if you wrote your answer. Google Drive, YouTube or Loom — set it so anyone with the link can view.
        </span>
        <ErrorSlot name="mediaLink" />
      </div>

      {/*
        Honeypot. Hidden from sight and from assistive tech, and skipped in the
        tab order, so only an automated form-filler ever puts a value in it.
        The server drops any submission that does.
      */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.company}
          onChange={set("company")}
        />
      </div>

      <button className="submit" type="submit" id="submit-btn" disabled={submitting}>
        {submitting ? "Sending…" : "Send my application"}
      </button>

      {/*
        One live region for the whole form, announced politely so a screen
        reader hears the outcome without anything stealing focus.
      */}
      <div
        ref={statusRef}
        className={`msg ${status ? "is-shown" : ""} ${status?.kind === "error" ? "msg--error" : ""}`}
        id="form-status"
        role="status"
        aria-live="polite"
      >
        {/* Single child: the collapse animates `grid-template-rows` on the
            parent, which needs exactly one row to size. */}
        <div className="msg__inner">
          {status && (
            <>
              <b>{status.headline}</b>
              <br />
              {status.detail}
              {status.offerSupport && (
                <>
                  {" Or email us at "}
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Bano Zypp Ke CM")}`}>
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </>
              )}
            </>
          )}
        </div>
      </div>

      <p className="legal">
        By applying you agree to be contacted about this program. Applications are reviewed on a rolling
        basis. Stipend, prize and role are subject to program terms shared at onboarding.
      </p>
    </form>
  );
};

export default CmApplyForm;
