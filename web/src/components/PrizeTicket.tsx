import { useState } from "react";

/**
 * The prize bar, as a two-panel carousel.
 *
 * The arrow advances to the next panel, which slides in from the right and
 * pushes the current one out to the left — clipped to the bar, so the movement
 * reads as one strip travelling behind a window rather than content flying
 * across the page.
 *
 * Panels are data, so adding a third is an entry in this array and nothing
 * else. Both currently carry the same copy; only the colour differs.
 */

interface Panel {
  /** Drives the panel's colour theme via a modifier class. */
  theme: "lime" | "pink";
  lead: { label: string; amount: string; sub: string };
  plus: { label: string; amount: string; sub: string };
}

const PANELS: Panel[] = [
  {
    theme: "lime",
    lead: { label: "Best City Manager wins", amount: "₹50,000", sub: "Cash, on stage, that day" },
    plus: { label: "Plus", amount: "₹15 LPA", sub: "Permanent City Manager role" },
  },
  {
    /*
     * The counterweight to the prize panel.
     *
     * The lime panel is what ONE person wins; on its own it reads as a lottery.
     * This one is what every selected applicant gets regardless of who wins,
     * which is the half that makes "CM" a job rather than a competition.
     * Figures come from the campaign brief: 8 seats, 8 cities, 90 paid days
     * with a city ops lead as mentor and a weekly scorecard.
     */
    theme: "pink",
    lead: { label: "Seats this cohort", amount: "8", sub: "8 freshers, 8 whole cities" },
    plus: {
      label: "Every seat gets",
      amount: "90 days paid",
      sub: "Ops-lead mentor + weekly scorecard",
    },
  },
];

const PrizeTicket = () => {
  const [index, setIndex] = useState(0);

  const showNext = () => setIndex((current) => (current + 1) % PANELS.length);

  return (
    <div className="ticket" role="group" aria-roledescription="carousel" aria-label="Prize details">
      {/* The window the strip travels behind. */}
      <div className="ticket-viewport" aria-live="polite">
        {/*
          `transform` is set on the track itself rather than inherited from a
          custom property on an ancestor — a variable read by children forces a
          style recalc for every one of them on each frame.
        */}
        <div className="ticket-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {PANELS.map((panel, panelIndex) => {
            const isActive = panelIndex === index;
            return (
              <div
                key={panel.theme}
                className={`ticket-panel ticket-panel--${panel.theme} ${isActive ? "is-active" : ""}`}
                // Off-screen panels are hidden from assistive tech and from
                // find-in-page. Safe to do bluntly here because the only
                // control lives outside the track, so this can never pull the
                // focused element out from under the user.
                aria-hidden={!isActive}
                role="group"
                aria-roledescription="slide"
                aria-label={`${panelIndex + 1} of ${PANELS.length}`}
              >
                <div className="ticket-part">
                  <p className="ticket-label">{panel.lead.label}</p>
                  <p className="ticket-amount">{panel.lead.amount}</p>
                  <p className="ticket-sub">{panel.lead.sub}</p>
                </div>
                <div className="ticket-part ticket-part--stub">
                  <p className="ticket-label">{panel.plus.label}</p>
                  <p className="ticket-amount">{panel.plus.amount}</p>
                  <p className="ticket-sub">{panel.plus.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Sits outside the track, so advancing never moves or hides the button the
        user just pressed — keyboard focus stays put across a slide.
      */}
      <button
        type="button"
        className="ticket-next"
        onClick={showNext}
        aria-label={`Show prize details ${((index + 1) % PANELS.length) + 1} of ${PANELS.length}`}
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
};

export default PrizeTicket;
