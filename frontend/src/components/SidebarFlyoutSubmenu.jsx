import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PAD = 8;
const FOOTER_GAP = 4;

function resolveFooterBottomLimit(anchorEl) {
  const footer =
    anchorEl.closest(".informationmenu")?.querySelector(".informationmenu-footer") ??
    document.querySelector(".informationmenu-footer");
  return footer
    ? footer.getBoundingClientRect().top - FOOTER_GAP
    : window.innerHeight - VIEWPORT_PAD;
}

function computeFlyoutPosition(anchorEl, flyoutEl) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const flyoutWidth = flyoutEl.offsetWidth;
  const bottomLimit = resolveFooterBottomLimit(anchorEl);

  // Always align with anchor — never shift top upward; clip via maxHeight + scroll.
  const top = Math.max(VIEWPORT_PAD, anchorRect.top - 2);
  let left = anchorRect.right;

  if (left + flyoutWidth > window.innerWidth - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, window.innerWidth - flyoutWidth - VIEWPORT_PAD);
  }

  const viewportMax = Math.max(0, window.innerHeight - VIEWPORT_PAD - top);
  const footerMax = Math.max(0, bottomLimit - top);
  const maxHeight = Math.min(viewportMax, footerMax);

  return { top, left, maxHeight };
}

function measureFlyoutLayout(anchor, flyout) {
  const next = computeFlyoutPosition(anchor, flyout);
  const prevMaxHeight = flyout.style.maxHeight;
  flyout.style.maxHeight = "none";
  const naturalHeight = flyout.scrollHeight;
  flyout.style.maxHeight = prevMaxHeight;

  const maxHeightPx =
    next.maxHeight > 0 ? next.maxHeight : window.innerHeight - VIEWPORT_PAD * 2;
  const needsScroll = naturalHeight > maxHeightPx + 1;

  return { ...next, maxHeightPx, needsScroll };
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
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 0 });
  const [scrollable, setScrollable] = useState(false);
  const [positioned, setPositioned] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPositioned(false);
      setScrollable(false);
      return undefined;
    }

    const anchor = anchorRef?.current;
    const flyout = flyoutRef.current;
    if (!anchor || !flyout) return undefined;

    const sync = () => {
      const layout = measureFlyoutLayout(anchor, flyout);
      flyout.style.maxHeight = `${layout.maxHeightPx}px`;
      const needsScroll =
        layout.needsScroll ||
        flyout.scrollHeight > flyout.clientHeight + 1;
      setPos((prev) =>
        prev.top === layout.top &&
        prev.left === layout.left &&
        prev.maxHeight === layout.maxHeight
          ? prev
          : { top: layout.top, left: layout.left, maxHeight: layout.maxHeight },
      );
      setScrollable(needsScroll);
      setPositioned(true);
    };

    sync();
    const raf1 = window.requestAnimationFrame(() => {
      sync();
      window.requestAnimationFrame(sync);
    });

    const menuContent = anchor.closest(".informationmenu-content");
    menuContent?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("ec:sidebar-layout-changed", sync);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(flyout);
    ro?.observe(anchor);

    return () => {
      window.cancelAnimationFrame(raf1);
      menuContent?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("ec:sidebar-layout-changed", sync);
      ro?.disconnect();
    };
  }, [open, anchorRef]);

  if (!open || typeof document === "undefined" || !document.body) return null;

  const maxHeightStyle =
    pos.maxHeight > 0 ? `${pos.maxHeight}px` : `calc(100dvh - ${VIEWPORT_PAD * 2}px)`;

  return createPortal(
    <div
      ref={flyoutRef}
      className={`submenu show${scrollable ? " submenu--scrollable" : ""}`}
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
        maxHeight: maxHeightStyle,
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
