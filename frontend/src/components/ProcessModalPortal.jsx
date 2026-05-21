import { createPortal } from "react-dom";

/** Render process/bank modals on document.body so they stack above the fixed sidebar. */
export default function ProcessModalPortal({ children }) {
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(children, document.body);
}

/** Inline backdrop layer — avoids trapped stacking inside #root .container on tablet. */
export const processModalBackdropStyle = {
  display: "block",
  position: "fixed",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  zIndex: 10050,
};
