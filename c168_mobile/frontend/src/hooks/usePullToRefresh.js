import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 72;
const MAX_PULL = 118;

function damp(delta) {
  if (delta <= 0) return 0;
  // Smooth rubber-band: feel travel early, resist near max.
  const eased = THRESHOLD * (1 - Math.exp(-delta / (THRESHOLD * 1.25)));
  return Math.min(MAX_PULL, eased);
}

/**
 * Touch pull-to-refresh for a vertical scroll container (scrollTop≈0 to arm).
 */
export function usePullToRefresh(scrollRef, { onRefresh, enabled = true, refreshing = false } = {}) {
  const [pullPx, setPullPx] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | pulling | armed | refreshing
  const startY = useRef(0);
  const tracking = useRef(false);
  const locked = useRef(false);
  const sawRefreshing = useRef(false);
  const pullPxRef = useRef(0);
  const rafRef = useRef(0);
  const fallbackTimer = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPull = useCallback((px) => {
    pullPxRef.current = px;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setPullPx(px));
  }, []);

  const settleIdle = useCallback(() => {
    locked.current = false;
    tracking.current = false;
    sawRefreshing.current = false;
    setPull(0);
    setPhase("idle");
  }, [setPull]);

  // Sync open/close with parent refresh flag (logo tap or successful pull).
  useEffect(() => {
    if (refreshing) {
      sawRefreshing.current = true;
      locked.current = true;
      window.clearTimeout(fallbackTimer.current);
      setPhase("refreshing");
      setPull(Math.max(pullPxRef.current, 52));
      return;
    }
    if (sawRefreshing.current) {
      settleIdle();
    }
  }, [refreshing, setPull, settleIdle]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || !enabled) return undefined;

    const onTouchStart = (e) => {
      if (locked.current || refreshing) return;
      if (el.scrollTop > 2) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      tracking.current = true;
    };

    const onTouchMove = (e) => {
      if (!tracking.current || locked.current || refreshing) return;
      if (el.scrollTop > 2) {
        tracking.current = false;
        setPull(0);
        setPhase("idle");
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startY.current;
      if (delta <= 0) {
        setPull(0);
        setPhase("idle");
        return;
      }
      const damped = damp(delta);
      setPull(damped);
      setPhase(damped >= THRESHOLD * 0.88 ? "armed" : "pulling");
      if (delta > 6) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;
      const shouldRefresh =
        pullPxRef.current >= THRESHOLD * 0.88 &&
        !refreshing &&
        typeof onRefreshRef.current === "function";

      if (!shouldRefresh) {
        setPull(0);
        setPhase("idle");
        return;
      }

      locked.current = true;
      setPhase("refreshing");
      setPull(52);
      Promise.resolve(onRefreshRef.current()).catch(() => {});
      // If parent never flips `refreshing`, don't leave the indicator stuck.
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = window.setTimeout(() => {
        if (!sawRefreshing.current && locked.current) settleIdle();
      }, 1200);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(fallbackTimer.current);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef, enabled, refreshing, setPull, settleIdle]);

  return {
    pullPx,
    progress: Math.min(1.2, pullPx / THRESHOLD),
    phase,
    active: phase !== "idle" || pullPx > 0.5,
  };
}
