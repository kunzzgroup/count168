import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PAD = 8;
const FOOTER_GAP = 4;

function computeFlyoutPosition(anchorEl, flyoutEl) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const flyoutHeight = flyoutEl.offsetHeight;
  const flyoutWidth = flyoutEl.offsetWidth;

  let top = Math.max(VIEWPORT_PAD, anchorRect.top - 2);
  let left = anchorRect.right;

  const footer = document.querySelector(".informationmenu-footer");
  const bottomLimit = footer
    ? footer.getBoundingClientRect().top - FOOTER_GAP
    : window.innerHeight - VIEWPORT_PAD;

  if (top + flyoutHeight > bottomLimit) {
    top = Math.max(VIEWPORT_PAD, bottomLimit - flyoutHeight);
  }

  if (left + flyoutWidth > window.innerWidth - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, window.innerWidth - flyoutWidth - VIEWPORT_PAD);
  }

  return { top, left };
}

/** Flyout submenu portaled to body — escapes sidebar overflow/transform clipping. */
export default function SidebarFlyoutSubmenu({
  id,
  open,
  anchorRef,
  onMouseEnter,
  onMouseLeave,
  children,
}) {
  const flyoutRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [positioned, setPositioned] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPositioned(false);
      return undefined;
    }

    const anchor = anchorRef?.current;
    const flyout = flyoutRef.current;
    if (!anchor || !flyout) return undefined;

    const sync = () => {
      const next = computeFlyoutPosition(anchor, flyout);
      setPos((prev) =>
        prev.top === next.top && prev.left === next.left ? prev : next,
      );
      setPositioned(true);
    };

    sync();

    const menuContent = document.querySelector(".informationmenu-content");
    menuContent?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(flyout);

    return () => {
      menuContent?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      ro?.disconnect();
    };
  }, [open, anchorRef, children]);

  if (!open || typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div
      ref={flyoutRef}
      className="submenu show"
      id={id}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        opacity: positioned ? 1 : 0,
        visibility: positioned ? "visible" : "hidden",
        transform: "translateX(0)",
        pointerEvents: "auto",
        zIndex: 4000,
        maxHeight: `calc(100dvh - ${VIEWPORT_PAD * 2}px)`,
        overflowY: "auto",
      }}
      aria-hidden={!open}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="submenu-content">{children}</div>
    </div>,
    document.body,
  );
}
