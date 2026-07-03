import { createPortal } from "react-dom";

/** Flyout submenu portaled to body — escapes sidebar overflow/transform clipping. */
export default function SidebarFlyoutSubmenu({
  id,
  open,
  top,
  left,
  onMouseEnter,
  onMouseLeave,
  children,
}) {
  if (!open || typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div
      className="submenu show"
      id={id}
      style={{
        position: "fixed",
        top,
        left,
        opacity: 1,
        transform: "translateX(0)",
        pointerEvents: "auto",
        zIndex: 4000,
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
