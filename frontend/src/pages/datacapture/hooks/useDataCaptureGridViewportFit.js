import { useEffect, useRef } from "react";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import {
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  GROUP_ONLY_GRID_COLS,
  GROUP_ONLY_GRID_ROWS,
  MAX_GRID_ROWS,
} from "../grid/dataCaptureGridMeta.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

const ROW_HEIGHT_FALLBACK = 30;

function measureFitRowCount(areaEl, groupOnly) {
  if (!areaEl) {
    return null;
  }

  const container = areaEl.closest(".excel-table-container") || areaEl;
  const table = areaEl.querySelector(".excel-table") || container.querySelector(".excel-table");
  const thead = table?.querySelector("thead");
  const sampleRow = table?.querySelector("tbody tr");
  const rowHeight = sampleRow?.getBoundingClientRect().height || ROW_HEIGHT_FALLBACK;
  const theadHeight = thead?.getBoundingClientRect().height || rowHeight;

  let available;
  if (groupOnly) {
    available = areaEl.clientHeight - theadHeight;
  } else {
    const headerBand = container.querySelector(".excel-table-header");
    const headerBandHeight = headerBand?.getBoundingClientRect().height || 0;
    available = areaEl.clientHeight - headerBandHeight - theadHeight;
  }

  if (available <= 0 || rowHeight <= 0) {
    return null;
  }

  return Math.ceil(available / rowHeight);
}

/**
 * Grow row count so the grid fills the table area (no blank band below the last row).
 * Only expands; never shrinks below the current row count.
 */
export function useDataCaptureGridViewportFit(groupOnly, engineReady, areaRef) {
  const { gridRef } = useDataCaptureContext();
  const rafRef = useRef(0);
  const minRows = groupOnly ? GROUP_ONLY_GRID_ROWS : DEFAULT_GRID_ROWS;
  const minCols = groupOnly ? GROUP_ONLY_GRID_COLS : DEFAULT_GRID_COLS;

  useEffect(() => {
    if (!engineReady) return undefined;

    const syncRowsToViewport = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const areaEl = areaRef?.current;
        if (!areaEl) return;

        const measured = measureFitRowCount(areaEl, groupOnly);
        if (measured == null) return;

        const fitRows = Math.max(minRows, Math.min(MAX_GRID_ROWS, measured));
        const grid = gridRef.current;
        const currentRows = grid?.rows ?? minRows;
        const currentCols = grid?.cols ?? minCols;

        if (fitRows > currentRows) {
          callDataCaptureRuntime("ensureGridReady", fitRows, currentCols);
          rafRef.current = requestAnimationFrame(syncRowsToViewport);
        }
      });
    };

    syncRowsToViewport();

    const areaEl = areaRef?.current;
    if (!areaEl) return undefined;

    const resizeObserver = new ResizeObserver(syncRowsToViewport);
    resizeObserver.observe(areaEl);

    const tableContainer = areaEl.closest(".excel-table-container") || areaEl;
    if (tableContainer !== areaEl) {
      resizeObserver.observe(tableContainer);
    }

    const topSection = document.querySelector("body.datacapture-page .top-section");
    if (topSection) {
      resizeObserver.observe(topSection);
    }

    window.addEventListener("resize", syncRowsToViewport);

    const lateSync = window.setTimeout(syncRowsToViewport, 120);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(lateSync);
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncRowsToViewport);
    };
  }, [areaRef, engineReady, gridRef, groupOnly, minCols, minRows]);
}
