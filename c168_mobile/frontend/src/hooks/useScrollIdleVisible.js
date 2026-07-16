import { useEffect, useRef, useState } from "react";

/**
 * Hide UI while the user is scrolling; reveal after scroll has been idle.
 */
export function useScrollIdleVisible(scrollRef, { idleMs = 280, minDelta = 2, onScrollStart } = {}) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  const timer = useRef(null);
  const onScrollStartRef = useRef(onScrollStart);
  onScrollStartRef.current = onScrollStart;

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    lastY.current = el.scrollTop;

    const clearTimer = () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const onScroll = () => {
      const y = el.scrollTop;
      const dy = Math.abs(y - lastY.current);
      lastY.current = y;
      if (dy < minDelta) return;

      setVisible(false);
      onScrollStartRef.current?.();
      clearTimer();
      timer.current = window.setTimeout(() => {
        setVisible(true);
        timer.current = null;
      }, idleMs);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimer();
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, idleMs, minDelta]);

  return visible;
}
