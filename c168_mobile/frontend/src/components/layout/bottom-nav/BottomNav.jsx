import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import {
  NAV_MOTION_DURATION,
  NAV_MOTION_EASE,
  buildBottomNavItems,
  isBottomNavItemActive,
} from "./navigationConfig.js";
import NavItem from "./NavItem.jsx";
import "./bottom-nav.css";

const indicatorTransition = {
  duration: NAV_MOTION_DURATION,
  ease: NAV_MOTION_EASE,
};

/**
 * Instagram-style fixed bottom navigation (adapted to EazyCount routes).
 * — Minimal bar, outline/fill icons, sliding indicator, 60fps transform motion.
 *
 * @param {{ me?: object|null, labels?: Record<string, string> }} props
 */
function BottomNav({ me, labels = {} }) {
  const { pathname } = useLocation();
  const items = useMemo(() => buildBottomNavItems(me), [me]);
  const rowRef = useRef(null);
  const [slotWidth, setSlotWidth] = useState(0);
  const [motionReady, setMotionReady] = useState(false);

  const activeIdx = Math.max(
    0,
    items.findIndex((item) => isBottomNavItemActive(pathname, item)),
  );

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || items.length === 0) return undefined;

    const measure = () => {
      const w = row.clientWidth;
      if (w > 0) setSlotWidth(w / items.length);
    };

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(row);
    window.addEventListener("resize", measure);

    const id = requestAnimationFrame(() => setMotionReady(true));
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(id);
    };
  }, [items.length]);

  const indicatorX = activeIdx * slotWidth;
  const indicatorInset = 10;

  return (
    <div className="m-bottom-nav">
      <div ref={rowRef} className="m-bottom-nav-row">
        {motionReady && slotWidth > 0 ? (
          <motion.div
            className="m-bottom-nav-indicator"
            aria-hidden="true"
            initial={false}
            style={{ width: Math.max(0, slotWidth - indicatorInset) }}
            animate={{ x: indicatorX + indicatorInset / 2 }}
            transition={indicatorTransition}
          />
        ) : null}

        {items.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            label={labels[item.labelKey] || item.labelKey}
            me={me}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(BottomNav);
