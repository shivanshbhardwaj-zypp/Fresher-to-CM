import React, { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals its children once they scroll into view, then stops watching.
 *
 * The hidden state is applied from JS (`is-armed`), never from the stylesheet.
 * If this component never mounts — a chunk that fails to load, a crash in a
 * sibling — the content stays plainly visible instead of being stranded at
 * `opacity: 0`, which is how a scroll reveal turns into a blank page.
 *
 * Children stagger via `nth-child` delays in cm.css rather than props, so a
 * section can gain a row without anyone renumbering anything.
 */

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Forwarded so a revealed section can still label itself for a11y. */
  "aria-labelledby"?: string;
}

const Reveal = ({ children, className = "", ...rest }: RevealProps) => {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "armed" | "visible">("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reduced motion, or a browser without IntersectionObserver: leave the
    // content exactly as it rendered. Nothing to arm, nothing to reveal.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    setState("armed");

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setState("visible");
        observer.disconnect();
      },
      { threshold: 0.12 },
    );

    observer.observe(node);

    /*
     * Failsafe. Arming hides the section, and only the observer un-hides it —
     * so anything that stops the observer from ever firing (a suspended
     * rendering pipeline, a zero-height ancestor at mount, a browser quirk)
     * would leave real content permanently invisible.
     *
     * Content is never allowed to depend on an animation succeeding, so if the
     * reveal has not happened well past when it should have, show it anyway.
     * On a healthy page the observer always wins this race.
     */
    const failsafe = window.setTimeout(() => setState("visible"), 1200);

    return () => {
      window.clearTimeout(failsafe);
      observer.disconnect();
    };
  }, []);

  // `is-armed` stays on once applied: it carries the hidden from-state, and
  // removing it in the same frame `is-visible` arrives would leave the
  // transition with nothing to animate from, so the section would just snap.
  const classes = [className, state !== "idle" && "is-armed", state === "visible" && "is-visible"]
    .filter(Boolean)
    .join(" ");

  return (
    <section ref={ref as React.RefObject<HTMLElement>} className={classes} {...rest}>
      {children}
    </section>
  );
};

export default Reveal;
