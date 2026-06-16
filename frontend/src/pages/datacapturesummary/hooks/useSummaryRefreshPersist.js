import { useEffect, useRef } from "react";
import { saveSummaryRefreshStatePure } from "../lib/summaryRefreshStatePure.js";
import { useSummaryContext } from "../context/SummaryContext.jsx";

/**
 * Persist formula/rate draft before F5 or tab close (legacy beforeunload parity).
 */
export function useSummaryRefreshPersist({ captureScope, processId, processCode, enabled }) {
  const { rows, dataPopulating } = useSummaryContext();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!enabled) return undefined;

    const persist = () => {
      if (window.isNavigatingAwayByBackOrSubmit) return;
      const currentRows = rowsRef.current;
      if (!currentRows?.length) return;
      saveSummaryRefreshStatePure(currentRows, { processId, processCode }, captureScope);
    };

    window.addEventListener("beforeunload", persist);
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("beforeunload", persist);
      window.removeEventListener("pagehide", persist);
    };
  }, [enabled, captureScope, processId, processCode]);

  useEffect(() => {
    if (!enabled || dataPopulating || !rows?.length) return undefined;
    const timer = window.setTimeout(() => {
      if (window.isNavigatingAwayByBackOrSubmit) return;
      saveSummaryRefreshStatePure(rows, { processId, processCode }, captureScope);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [enabled, rows, dataPopulating, captureScope, processId, processCode]);
}
