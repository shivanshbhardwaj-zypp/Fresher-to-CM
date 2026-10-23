import StrikeWord from "./components/StrikeWord";
import Reveal from "./components/Reveal";
import PrizeTicket from "./components/PrizeTicket";
import CmApplyForm from "./components/CmApplyForm";
import OnboardingMeter from "./components/OnboardingMeter";
import "./cm.css";

/**
 * "Bano Zypp Ke CM" — standalone campaign landing page.
 *
 * Deliberately does NOT use the site's shared Header/Footer: this is a
 * single-purpose recruitment campaign with its own dark identity, and wrapping
 * the marketing chrome around it would fight that. It carries its own nav and
 * footer instead.
 *
 * Everything is scoped under `.bano-cm` (see cm.css) so none of that dark
 * styling escapes into the rest of zypp.app.
 */

/** Zypp Electric's main site, linked from the hero mark and the footer tag. */
const ZYPP_URL = "https://zypp.app";


const OWNERSHIP = [
  {
    title: "Own the riders",
    body: "Talk to gig partners across your hubs every week. Learn what actually costs them earnings, then kill those problems one by one.",
  },
  {
    title: "Onboard the riders",
    body: "Your number one job: get more riders on Zypp. Run onboarding drives, partner with fleets and local networks, and turn every hub in your city into an onboarding machine.",
  },
  {
    title: "Own the P&L",
    body: "City-wide uptime, repair turnaround, costs across every hub. You'll see your city's numbers weekly. They don't lie and they don't wait.",
  },
  {
    title: "Own an idea",
    body: "Ship one innovation nobody asked you for. The thing you noticed because you were standing there and nobody else was.",
  },
];

const STEPS = [
  { step: "Step 1", title: "Apply", body: "Fill the form below. Two minutes. No resume needed." },
  {
    step: "Step 2",
    title: "Selection",
    body: "Shortlist, a short call, and your answer to the city question.",
  },
  { step: "Step 3", title: "Onboarding", body: "You get your city, its hubs, your mentor, and your scorecard." },
  { step: "Step 4", title: "90-day sprint", body: "You run it. Paid stipend throughout." },
  {
    step: "Step 5",
    title: "Felicitation",
    body: "Best City Manager announced on stage. Cash and offer, same day.",
  },
];

const SCORECARD = [
  { metric: "Acquisition", question: "How many new riders did you onboard?" },
  { metric: "Retention", question: "Are they still riding 30 days later?" },
  { metric: "City P&L", question: "Did your city get more profitable?" },
  { metric: "Innovation", question: "What did you build?" },
];

const QUALIFIES = [
  "Freshers and anyone with up to 2 years of experience",
  "Any degree, any college, any stream — or no degree at all",
  "You're willing to be on the ground, moving between hubs, every day",
  "You'd rather run something small for real than shadow something big",
];

const NOT_REQUIRED = [
  "An MBA is not required. Neither is a tier-1 campus.",
  "Prior work experience is not required.",
  "A polished resume is not required. We're not asking for one.",
];

const BanoZyppKeCM = () => (
  <div className="bano-cm">

    <a className="skip-link" href="#apply">
      Skip to the application form
    </a>

    <div className="wrap">
      <nav className="cm-nav">
        <div className="brand">
          ZYPP <span>ELECTRIC</span>
        </div>
        <a className="nav-cta" href="#apply">
          Apply now
        </a>
      </nav>
    </div>

    <main>
      <header className="wrap hero">
        <ul className="stickers">
          <li className="tag tag--hot">90 Days</li>
          <li className="tag tag--lime">No MBA</li>
          <li className="tag tag--ghost">No experience</li>
        </ul>

        {/* One baseline row: FROM · FRESHER · TO · CM · @zypp. The words are
            sized in vw so the line grows to fill the column rather than
            stacking and leaving the right half of the hero empty. */}
        <h1 className="hero-title">
          <span className="hero-label hero-label--from">From</span>
          <StrikeWord className="hero-word hero-word--from">Fresher</StrikeWord>
          <span className="hero-label hero-label--to">To</span>
          <span className="hero-word hero-word--cm">CM</span>
          <a
            className="hero-at"
            href={ZYPP_URL}
            target="_blank"
            rel="noreferrer noopener"
            title="Visit zypp.app"
          >
            @ zypp
            <span className="sr-only"> (opens the Zypp Electric website in a new tab)</span>
          </a>
        </h1>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="lede">
              You won't intern. You'll run a whole Zypp city for 90 days — every hub, one city
              P&amp;L, and one target: get more riders on Zypp and keep them riding.{" "}
              <b>Degree nahi chahiye. Sirf hunger chahiye.</b>
            </p>

            <PrizeTicket />

            <p className="note">Paid stipend for all 90 days. Strong runners-up get offers too.</p>

            <Reveal className="hero-what" aria-labelledby="what-you-do">
              <h2 className="sec-head" id="what-you-do">
                What you <span className="lm">actually</span> do
              </h2>
              <p className="sec-intro">
                Zypp grows one rider at a time, and every rider joins through a city. For 90 days, your job is to make yours the fastest-growing one.
              </p>

              <ol className="owns stagger">
                {OWNERSHIP.map((item, index) => (
                  <li className="own" key={item.title}>
                    <span className="own-n" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>

            <OnboardingMeter />
          </div>

          <section className="hero-form" id="apply" aria-labelledby="apply-head">
            <h2 className="form-head" id="apply-head">
              Apply to be a <span className="lm">City Manager</span>
            </h2>
            <p className="form-intro">
              Two minutes. Straight to the founder's desk. The last question decides shortlists.
            </p>
            <CmApplyForm />
          </section>
        </div>
      </header>


      <Reveal className="wrap cm-section" aria-labelledby="how-it-works">
        <h2 className="sec-head" id="how-it-works">
          How the <span className="lm">90 days</span> work
        </h2>
        <p className="sec-intro">
          This is a real program, not a stunt. You get a mentor from our ops leadership and a scorecard
          every week.
        </p>

        <ol className="steps stagger">
          {STEPS.map((item) => (
            <li className="step" key={item.step}>
              <p className="step-n">{item.step}</p>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>

        <h3 className="bar-head">What you're scored on</h3>
        <ul className="bar stagger">
          {SCORECARD.map((item) => (
            <li key={item.metric}>
              <b>{item.metric}</b>
              <span>{item.question}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal className="wrap cm-section" aria-labelledby="who-applies">
        <h2 className="sec-head" id="who-applies">
          Who should <span className="lm">apply</span>
        </h2>
        <ul className="check stagger">
          {QUALIFIES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <ul className="check check--nope stagger">
          {NOT_REQUIRED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Reveal>

      <div className="wrap punch">
        <h2>
          Ab Fresher
          <br />
          <span className="lm">Banega CM.</span>
        </h2>
        <p className="punch-sig">
          Build with me in public. — Akash Gupta, Co-founder &amp; CEO, Zypp Electric
        </p>
      </div>
    </main>

    <div className="wrap">
      <footer className="cm-footer">
        <span>Zypp Electric · Bycyshare Technologies Pvt. Ltd.</span>
        <a
          className="footer-tag"
          href={ZYPP_URL}
          target="_blank"
          rel="noreferrer noopener"
          title="Visit zypp.app"
        >
          #BanoZyppKeCM
          <span className="sr-only"> (opens the Zypp Electric website in a new tab)</span>
        </a>
      </footer>
    </div>
  </div>
);

export default BanoZyppKeCM;
