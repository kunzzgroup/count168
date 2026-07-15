import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 68;
const MAX_PULL = 112;
const ARM_AT = THRESHOLD * 0.9;

/** Finger delta → visible pull distance (snappy first, then rubber-band). */
function damp(delta) {
  if (delta <= 0) return 0;
  const felt = delta * 0.52;
  if (felt <= THRESHOLD) return Math.min(MAX_PULL, felt);
  const over = felt - THRESHOLD;
  return Math.min(MAX_PULL, THRESHOLD + over * 0.22);
}

/**
 * Touch pull-to-refresh for a vertical scroll container (scrollTop≈0 to arm).
 * Skips horizontal pans (KPI carousels) and ignores mid-scroll pulls.
 */
export function usePullToRefresh(scrollRef, { onRefresh, enabled = true, refreshing = false } = {}) {
  const [pullPx, setPullPx] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | pulling | armed | refreshing
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const ignored = useRef(false);
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
    ignored.current = false;
    sawRefreshing.current = false;
    setPull(0);
    setPhase("idle");
  }, [setPull]);

  useEffect(() => {
    if (refreshing) {
      sawRefreshing.current = true;
      locked.current = true;
      window.clearTimeout(fallbackTimer.current);
      setPhase("refreshing");
      setPull(Math.max(pullPxRef.current, 48));
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
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
      startX.current = t.clientX;
      ignored.current = false;
      // Only arm at (near) top — tiny slack for bounce overscroll.
      tracking.current = el.scrollTop <= 2;
    };

    const onTouchMove = (e) => {
      if (!tracking.current || locked.current || refreshing || ignored.current) return;
      if (el.scrollTop > 2) {
        tracking.current = false;
        setPull(0);
        setPhase("idle");
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startX.current);
      const dy = t.clientY - startY.current;

      // Horizontal gesture (e.g. KPI swipe) — abort pull.
      if (dx > 12 && dx > Math.abs(dy) * 1.1) {
        ignored.current = true;
        tracking.current = false;
        setPull(0);
        setPhase("idle");
        return;
      }

      if (dy <= 0) {
        setPull(0);
        setPhase("idle");
        return;
      }

      const damped = damp(dy);
      setPull(damped);
      setPhase(damped >= ARM_AT ? "armed" : "pulling");
      // Lock vertical scroll only once the user clearly intends to pull.
      if (dy > 10) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!tracking.current && !locked.current) {
        ignored.current = false;
        return;
      }
      if (!tracking.current) return;
      tracking.current = false;
      ignored.current = false;

      const shouldRefresh =
        pullPxRef.current >= ARM_AT && !refreshing && typeof onRefreshRef.current === "function";

      if (!shouldRefresh) {
        setPull(0);
        setPhase("idle");
        return;
      }

      locked.current = true;
      setPhase("refreshing");
      setPull(48);
      Promise.resolve(onRefreshRef.current()).catch(() => {});
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = window.setTimeout(() => {
        if (!sawRefreshing.current && locked.current) settleIdle();
      }, 1400);
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
    progress: Math.min(1.15, pullPx / THRESHOLD),
    phase,
    active: phase !== "idle" || pullPx > 0.5,
  };
}
