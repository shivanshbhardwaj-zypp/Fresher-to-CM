import { useState } from "react";

/**
 * "Run your city" — a slider that turns a daily onboarding pace into a 90-day
 * total, so the applicant feels the scale of the job before they apply.
 * Pure arithmetic: no claims about targets Zypp hasn't published.
 */

const DAYS = 90;
const MAX_PER_DAY = 40;

const TIERS = [
  { min: 0, label: "Warming up", note: "Every city starts here. Now find the second gear." },
  { min: 10, label: "Hub hero", note: "One strong hub's worth. Now make every hub do it." },
  { min: 25, label: "City Manager material", note: "That's a whole city moving. This is the job." },
];

const OnboardingMeter = () => {
  const [perDay, setPerDay] = useState(12);
  const total = perDay * DAYS;
  const tier = [...TIERS].reverse().find((t) => perDay >= t.min) ?? TIERS[0];

  return (
    <aside className="meter" aria-labelledby="meter-head">
      <p className="meter-kicker">Run the numbers</p>
      <h3 className="meter-head" id="meter-head">
        How many riders can <span className="lm">your city</span> onboard?
      </h3>

      <label className="meter-label" htmlFor="meter-range">
        Riders onboarded per day: <b>{perDay}</b>
      </label>
      <input
        id="meter-range"
        className="meter-range"
        type="range"
        min={1}
        max={MAX_PER_DAY}
        value={perDay}
        onChange={(e) => setPerDay(Number(e.target.value))}
        style={{ "--fill": `${((perDay - 1) / (MAX_PER_DAY - 1)) * 100}%` } as React.CSSProperties}
      />

      <div className="meter-out" aria-live="polite">
        <p className="meter-total">
          {total.toLocaleString("en-IN")} <span>riders in {DAYS} days</span>
        </p>
        <p className="meter-tier">
          <b>{tier.label}.</b> {tier.note}
        </p>
      </div>

      <a className="meter-cta" href="#apply">
        Think you can beat that? Apply →
      </a>
    </aside>
  );
};

export default OnboardingMeter;
