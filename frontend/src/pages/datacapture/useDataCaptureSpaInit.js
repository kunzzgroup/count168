import { useLayoutEffect, useRef } from "react";
import { initDataCaptureSpaPage } from "./dataCaptureSpaInit.js";

/**
 * Phase 5h: React-owned SPA bootstrap (replaces legacy initDataCapturePage for SPA).
 */
export function useDataCaptureSpaInit() {
  const initRef = useRef(initDataCaptureSpaPage);
  initRef.current = initDataCaptureSpaPage;

  useLayoutEffect(() => {
    window.__DC_SPA_INIT_PAGE__ = () => initRef.current();
    return () => {
      delete window.__DC_SPA_INIT_PAGE__;
    };
  }, []);
}
