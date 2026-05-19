import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from "./dataCaptureGridConstants.js";
import {
  clearEditableGridCells,
  populateGridFromSnapshot,
  readGridDimensions,
} from "./dataCaptureGridSnapshot.js";
import { shouldRestoreFromUrl } from "./dataCaptureStorage.js";

/**
 * Phase 3: Grid lifecycle in React — init dimensions, clear, restore cell values.
 * Legacy still binds per-cell handlers (click, paste, selection) via `buildDataCaptureTable`.
 */
export function useDataCaptureGrid(scriptsReady) {
  const dimensionsRef = useRef({ rows: DEFAULT_GRID_ROWS, cols: DEFAULT_GRID_COLS });
  const defaultInitDoneRef = useRef(false);

  const initializeGrid = useCallback((rows = DEFAULT_GRID_ROWS, cols = DEFAULT_GRID_COLS) => {
    const r = Math.max(1, Number(rows) || DEFAULT_GRID_ROWS);
    const c = Math.max(1, Number(cols) || DEFAULT_GRID_COLS);
    dimensionsRef.current = { rows: r, cols: c };

    if (typeof window.__DC_LEGACY_BUILD_TABLE__ === "function") {
      window.__DC_LEGACY_BUILD_TABLE__(r, c);
    } else if (typeof window.initializeTable === "function") {
      window.initializeTable(r, c);
    }

    window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
    return dimensionsRef.current;
  }, []);

  const handlersRef = useRef({});
  handlersRef.current = { initializeGrid };

  useLayoutEffect(() => {
    window.__DC_INITIALIZE_TABLE__ = (rows, cols) => handlersRef.current.initializeGrid(rows, cols);
    window.__DC_POPULATE_GRID_FROM_SNAPSHOT__ = populateGridFromSnapshot;
    window.__DC_CLEAR_GRID_CELLS__ = clearEditableGridCells;
    window.__DC_GET_GRID_DIMENSIONS__ = readGridDimensions;

    return () => {
      delete window.__DC_INITIALIZE_TABLE__;
      delete window.__DC_POPULATE_GRID_FROM_SNAPSHOT__;
      delete window.__DC_CLEAR_GRID_CELLS__;
      delete window.__DC_GET_GRID_DIMENSIONS__;
    };
  }, []);

  useEffect(() => {
    if (!scriptsReady || defaultInitDoneRef.current) return;
    if (shouldRestoreFromUrl()) return;

    defaultInitDoneRef.current = true;
    const dims = readGridDimensions();
    if (dims.rows > 0 && dims.cols > 0) {
      dimensionsRef.current = dims;
      return;
    }
    initializeGrid(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);
  }, [scriptsReady, initializeGrid]);

  useEffect(() => {
    if (!scriptsReady) return;

    let cleanup = null;
    let pollId = null;

    const attach = () => {
      const tableBody = document.getElementById("tableBody");
      if (!tableBody) return false;

      const notify = () => {
        window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
      };

      tableBody.addEventListener("input", notify, true);
      tableBody.addEventListener("focusin", notify, true);

      cleanup = () => {
        tableBody.removeEventListener("input", notify, true);
        tableBody.removeEventListener("focusin", notify, true);
      };
      return true;
    };

    if (!attach()) {
      pollId = setInterval(() => {
        if (attach()) clearInterval(pollId);
      }, 200);
    }

    return () => {
      clearInterval(pollId);
      cleanup?.();
    };
  }, [scriptsReady]);

  return {
    initializeGrid,
    dimensions: dimensionsRef.current,
  };
}
