import { useEffect } from "react";
import { handleDocumentGridKeydown } from "./dataCaptureGridDocumentKeyboard.js";
import { handleDocumentGridOutsideClick } from "./dataCaptureGridOutsideClick.js";

/**
 * Phase 5a: SPA-owned document-level grid keyboard + outside-click.
 * Per-cell mouse/keyboard still bound by legacy `bindDataCaptureCellEvents`.
 */
export function useDataCaptureGridInteraction(scriptsReady) {
  useEffect(() => {
    if (!scriptsReady) return;

    document.addEventListener("keydown", handleDocumentGridKeydown);
    document.addEventListener("click", handleDocumentGridOutsideClick);

    return () => {
      document.removeEventListener("keydown", handleDocumentGridKeydown);
      document.removeEventListener("click", handleDocumentGridOutsideClick);
    };
  }, [scriptsReady]);
}
