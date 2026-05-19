import { useEffect } from "react";

/**
 * Phase 5a: SPA-owned page chrome that legacy `initDataCapturePage` used to bind.
 * Context menu positioning still lives in legacy; React owns scroll/resize + page-ready.
 */
export function useDataCaptureGridChrome(scriptsReady) {
  useEffect(() => {
    if (!scriptsReady) return;

    const pageReadyTimer = setTimeout(() => {
      document.body.classList.add("page-ready");
    }, 50);

    const updateMenuPosition = () => {
      if (typeof window.updateActiveContextMenuPosition === "function") {
        window.updateActiveContextMenuPosition();
      }
    };

    const scrollContainer = document.querySelector(".excel-table-container");
    scrollContainer?.addEventListener("scroll", updateMenuPosition, { passive: true });
    window.addEventListener("resize", updateMenuPosition);

    return () => {
      clearTimeout(pageReadyTimer);
      scrollContainer?.removeEventListener("scroll", updateMenuPosition);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [scriptsReady]);
}
