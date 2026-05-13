import { useEffect, useReducer, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { subscribeTrackedActionDepth } from "@/lib/actionProgressDepth";
import { cn } from "@/lib/utils";

/** @typedef {'off' | 'scheduled' | 'on' | 'finishing'} Phase */

function phaseReducer(state, action) {
  switch (action.type) {
    case "WORK_START":
      if (state.phase === "off") return { phase: "scheduled" };
      if (state.phase === "finishing") return { phase: "on" };
      return state;
    case "WORK_END":
      if (state.phase === "scheduled") return { phase: "off" };
      if (state.phase === "on") return { phase: "finishing" };
      return state;
    case "SHOW":
      if (state.phase === "scheduled") return { phase: "on" };
      return state;
    case "HIDE":
      return { phase: "off" };
    default:
      return state;
  }
}

const SHOW_DELAY_MS = 160;
const FINISH_VISIBLE_MS = 380;

/**
 * Top-of-screen progress for any pending React Query mutation plus optional
 * {@link withTrackedAction} / {@link beginTrackedAction} depth. Shown only if
 * work lasts longer than {@link SHOW_DELAY_MS}. Finishes when work ends, then hides.
 */
export default function GlobalActionProgressBar() {
  const mutating = useIsMutating();
  const [{ phase }, dispatch] = useReducer(phaseReducer, { phase: "off" });
  const [trackedDepth, setTrackedDepth] = useState(0);

  useEffect(() => {
    return subscribeTrackedActionDepth(setTrackedDepth);
  }, []);

  const inFlight = mutating > 0 || trackedDepth > 0;
  const inFlightRef = useRef(inFlight);
  inFlightRef.current = inFlight;

  useEffect(() => {
    if (inFlight) {
      dispatch({ type: "WORK_START" });
    } else {
      dispatch({ type: "WORK_END" });
    }
  }, [inFlight]);

  useEffect(() => {
    if (phase !== "scheduled") return undefined;
    const t = window.setTimeout(() => {
      if (inFlightRef.current) dispatch({ type: "SHOW" });
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "finishing") return undefined;
    const t = window.setTimeout(() => {
      dispatch({ type: "HIDE" });
    }, FINISH_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const show = phase === "on" || phase === "finishing";

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-0 right-0 top-0 z-[300] h-1 overflow-hidden bg-primary/15 transition-opacity duration-200",
        show ? "opacity-100" : "opacity-0"
      )}
      aria-hidden
    >
      {phase === "on" && (
        <div
          className="global-action-progress-indeterminate h-full w-[38%] rounded-none bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.45)]"
        />
      )}
      {phase === "finishing" && (
        <div className="h-full w-full origin-left bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.35)] animate-[global-action-progress-complete_0.38s_ease-out_forwards]" />
      )}
    </div>
  );
}
