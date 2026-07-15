import { useCallback, useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;

/**
 * Touch pull-to-refresh for a vertical scroll container (must be scrollTop===0 to arm).
 */
export function usePullToRefresh(scrollRef, { onRefresh, enabled = true, refreshing = false } = {}) {
  const [pullPx, setPullPx] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const locked = useRef(false);
  const armedRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const reset = useCallback(() => {
    pulling.current = false;
    armedRef.current = false;
    setPullPx(0);
  }, []);

  useEffect(() => {
    if (!refreshing) locked.current = false;
  }, [refreshing]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || !enabled) return undefined;

    const onTouchStart = (e) => {
      if (locked.current || refreshing) return;
      if (el.scrollTop > 1) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = true;
    };

    const onTouchMove = (e) => {
      if (!pulling.current || locked.current || refreshing) return;
      if (el.scrollTop > 1) {
        reset();
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startY.current;
      if (delta <= 0) {
        armedRef.current = false;
        setPullPx(0);
        return;
      }
      const damped = Math.min(MAX_PULL, delta * 0.45);
      armedRef.current = damped >= PULL_THRESHOLD * 0.45;
      setPullPx(damped);
      if (delta > 8) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      const shouldRefresh = armedRef.current && !refreshing && typeof onRefreshRef.current === "function";
      pulling.current = false;
      armedRef.current = false;
      if (shouldRefresh) {
        locked.current = true;
        setPullPx(PULL_THRESHOLD * 0.4);
        Promise.resolve(onRefreshRef.current()).finally(() => {
          locked.current = false;
          setPullPx(0);
        });
        return;
      }
      reset();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef, enabled, refreshing, reset]);

  return {
    pullPx: refreshing ? Math.max(pullPx, 28) : pullPx,
    pulling: pullPx > 4 || refreshing,
  };
}
