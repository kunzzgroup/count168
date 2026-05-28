import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseMaintenanceDateTime } from "./maintenanceCreatedAtDisplay.js";

const TOOLTIP_GAP = 6;

/**
 * Created At: date only; time in a fixed portal tooltip on hover (not clipped by virtual rows).
 * @param {{ value?: string | null, fallback?: string }} props
 */
export default function MaintenanceCreatedAtDisplay({ value, fallback = "-" }) {
  const parsed = parseMaintenanceDateTime(value);
  const hasTime = Boolean(parsed?.time);
  const date = parsed?.date ?? "";
  const time = parsed?.time ?? "";

  const anchorRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState(null);

  const updateTooltipPos = useCallback(() => {
    const el = anchorRef.current;
    if (!el || !hasTime) return;
    const rect = el.getBoundingClientRect();
    const placeBelow = rect.top < 44;
    setTooltipPos({
      left: rect.left,
      top: placeBelow ? rect.bottom + TOOLTIP_GAP : rect.top - TOOLTIP_GAP,
      placeBelow,
    });
  }, [hasTime]);

  const showTooltip = useCallback(() => {
    updateTooltipPos();
  }, [updateTooltipPos]);

  const hideTooltip = useCallback(() => {
    setTooltipPos(null);
  }, []);

  useEffect(() => {
    if (!tooltipPos) return undefined;
    const onScrollOrResize = () => hideTooltip();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [tooltipPos, hideTooltip]);

  if (!parsed) return fallback;

  const tooltipNode =
    tooltipPos && hasTime
      ? createPortal(
          <span
            className={`maintenance-created-at-tooltip-portal${
              tooltipPos.placeBelow ? " maintenance-created-at-tooltip-portal--below" : ""
            }`}
            style={{ left: tooltipPos.left, top: tooltipPos.top }}
            role="tooltip"
          >
            {time}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={`maintenance-created-at-display${hasTime ? " maintenance-created-at-display--has-time" : ""}`}
        onMouseEnter={hasTime ? showTooltip : undefined}
        onMouseLeave={hasTime ? hideTooltip : undefined}
        aria-label={hasTime ? `${date} ${time}` : date}
      >
        <span className="maintenance-created-at-date">{date}</span>
      </span>
      {tooltipNode}
    </>
  );
}
