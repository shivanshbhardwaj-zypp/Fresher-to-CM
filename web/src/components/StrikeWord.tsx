import { useEffect, useState, type ReactNode } from "react";

/**
 * A word with a slash that draws itself through the word on every page load.
 *
 * This is the campaign's whole argument in one graphic — "fresher" is the thing
 * being struck out — so the strike is animated rather than painted flat: the
 * word lands intact, then the slash cuts it. The `<s>` element carries the same
 * "no longer applies" meaning to assistive tech, with its default underline
 * suppressed because cm.css paints its own.
 */

/**
 * Lands the cut just after the hero's entrance cascade has settled (the title
 * is the second child, at 110ms delay + 460ms duration), so the word is fully
 * in place before it gets struck rather than being cut mid-flight.
 */
const CUT_DELAY_MS = 700;

interface StrikeWordProps {
  children: ReactNode;
  className?: string;
}

const StrikeWord = ({ children, className = "" }: StrikeWordProps) => {
  const [isCut, setIsCut] = useState(false);

  useEffect(() => {
    // The strike carries meaning, so reduced motion keeps it — it just arrives
    // already drawn instead of animating. Never "no strike at all".
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsCut(true);
      return;
    }

    const timer = window.setTimeout(() => setIsCut(true), CUT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <s className={`strike-word ${isCut ? "is-cut" : ""} ${className}`.trim()}>
      {children}
      <span className="strike-word__slash" aria-hidden="true" />
    </s>
  );
};

export default StrikeWord;
