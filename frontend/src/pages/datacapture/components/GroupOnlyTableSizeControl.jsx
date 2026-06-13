import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import {
  GROUP_ONLY_GRID_COLS,
  GROUP_ONLY_GRID_ROWS,
  MAX_GRID_ROWS,
} from "../grid/dataCaptureGridMeta.js";
import { callDataCaptureRuntime } from "../lib/dataCaptureRuntime.js";

const GROUP_ONLY_TABLE_SIZE_MAX_COLS = 50;

function clampDimension(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function readGridDimensions(gridRef, gridVersion) {
  void gridVersion;
  const grid = gridRef.current;
  return {
    rows: grid?.rows ?? GROUP_ONLY_GRID_ROWS,
    cols: grid?.cols ?? GROUP_ONLY_GRID_COLS,
  };
}

/**
 * Group-only table size picker — Apply resizes grid; Clear restores 11×11.
 */
export default function GroupOnlyTableSizeControl({ t, engineReady = false }) {
  const { gridRef, gridVersion } = useDataCaptureContext();
  const [open, setOpen] = useState(false);
  const [draftRows, setDraftRows] = useState(GROUP_ONLY_GRID_ROWS);
  const [draftCols, setDraftCols] = useState(GROUP_ONLY_GRID_COLS);
  const rootRef = useRef(null);

  const { rows: currentRows, cols: currentCols } = useMemo(
    () => readGridDimensions(gridRef, gridVersion),
    [gridRef, gridVersion],
  );

  const syncDraftFromGrid = useCallback(() => {
    const { rows, cols } = readGridDimensions(gridRef, gridVersion);
    setDraftRows(rows);
    setDraftCols(cols);
  }, [gridRef, gridVersion]);

  const applySize = useCallback(
    (rows, cols) => {
      if (!engineReady) return;
      const r = clampDimension(rows, 1, MAX_GRID_ROWS);
      const c = clampDimension(cols, 1, GROUP_ONLY_TABLE_SIZE_MAX_COLS);
      callDataCaptureRuntime("ensureGridReady", r, c);
      setDraftRows(r);
      setDraftCols(c);
      setOpen(false);
    },
    [engineReady],
  );

  const handleApply = useCallback(() => {
    applySize(draftRows, draftCols);
  }, [applySize, draftRows, draftCols]);

  const handleClear = useCallback(() => {
    applySize(GROUP_ONLY_GRID_ROWS, GROUP_ONLY_GRID_COLS);
  }, [applySize]);

  const openPopover = useCallback(() => {
    syncDraftFromGrid();
    setOpen(true);
  }, [syncDraftFromGrid]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const totalCells = draftRows * draftCols;

  return (
    <div className="dc-table-size" ref={rootRef}>
      <div className="dc-table-size-trigger-row">
        <span className="dc-table-size-label">{t("tableSize")}</span>
        <button
          type="button"
          className="dc-table-size-trigger"
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={!engineReady}
          onClick={() => (open ? setOpen(false) : openPopover())}
        >
          <span className="dc-table-size-trigger-value">{currentRows}</span>
          <span className="dc-table-size-trigger-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        <button
          type="button"
          className="dc-table-size-reset-icon"
          title={t("tableSizeResetTitle")}
          aria-label={t("tableSizeResetTitle")}
          disabled={!engineReady}
          onClick={handleClear}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.99 5.99 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="dc-table-size-popover" role="dialog" aria-label={t("tableSize")}>
          <div className="dc-table-size-popover-header">
            <span>{t("tableSize")}</span>
            <button
              type="button"
              className="dc-table-size-popover-close"
              aria-label={t("cancel")}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="dc-table-size-fields">
            <label className="dc-table-size-field">
              <span className="dc-table-size-field-label">{t("tableSizeRows")}</span>
              <input
                type="number"
                min={1}
                max={MAX_GRID_ROWS}
                value={draftRows}
                onChange={(e) => setDraftRows(clampDimension(e.target.value, 1, MAX_GRID_ROWS))}
              />
            </label>
            <label className="dc-table-size-field">
              <span className="dc-table-size-field-label">{t("tableSizeColumns")}</span>
              <input
                type="number"
                min={1}
                max={GROUP_ONLY_TABLE_SIZE_MAX_COLS}
                value={draftCols}
                onChange={(e) =>
                  setDraftCols(clampDimension(e.target.value, 1, GROUP_ONLY_TABLE_SIZE_MAX_COLS))
                }
              />
            </label>
          </div>

          <p className="dc-table-size-summary">
            {t("tableSizeTotalCells", {
              rows: draftRows,
              cols: draftCols,
              total: totalCells,
            })}
          </p>

          <div className="dc-table-size-actions">
            <button type="button" className="btn btn-cancel dc-table-size-clear-btn" onClick={handleClear}>
              {t("clear")}
            </button>
            <button type="button" className="btn btn-save dc-table-size-apply-btn" onClick={handleApply}>
              {t("apply")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
