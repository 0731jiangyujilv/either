import {useCallback, useEffect, useState} from "react";

import {Logo} from "./Logo";

const SESSION_KEY = "either:curtain-seen";
const HOLD_MS = 1800;
const FADE_MS = 500;

/**
 * The intro curtain: a dashed rule draws itself across the viewport, the lockup
 * fades in on top of it, then the whole layer fades away to reveal the arena.
 *
 * Plays once per browser session, and is skippable with a click or any key.
 */
export function LoadingCurtain() {
  // `null` = still deciding (avoids a flash before sessionStorage is readable)
  const [phase, setPhase] = useState<"hidden" | "in" | "out" | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // private mode or blocked storage: just play it
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced) {
      setPhase("hidden");
      return;
    }

    setPhase("in");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const dismiss = useCallback(() => {
    setPhase((current) => (current === "in" ? "out" : current));
  }, []);

  // auto-advance after the animation has had time to land
  useEffect(() => {
    if (phase !== "in") return;
    const timer = window.setTimeout(dismiss, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, dismiss]);

  // unmount after the fade, and remember we played
  useEffect(() => {
    if (phase !== "out") return;
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // nothing to do; it will simply play again next time
      }
      document.body.style.overflow = "";
      setPhase("hidden");
    }, FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "in") return;
    const onKey = () => dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, dismiss]);

  if (phase === null || phase === "hidden") return null;

  return (
    <div
      className={phase === "out" ? "curtain curtain--out" : "curtain"}
      onClick={dismiss}
      role="presentation"
      aria-hidden="true"
    >
      <div className="curtain__line" />
      <Logo className="curtain__logo" />
      <span className="curtain__skip">click to enter</span>
    </div>
  );
}
