import { memo, useLayoutEffect, useRef } from "react";

/** Injected once per mount so React does not own `<tr>` nodes legacy adds under `#tableBody` (avoids removeChild crashes on unmount). */
const LEGACY_GRID_HTML = `
<table class="excel-table" id="dataTable">
  <thead id="tableHeader"><tr><th></th></tr></thead>
  <tbody id="tableBody"></tbody>
</table>
<div id="tablePreviewFormat" class="table-preview-format" style="display:none">
  <iframe id="tablePreviewFrameFormat" class="table-preview-frame-format" title="Format Table Preview"></iframe>
</div>
<div id="pasteAreaFormat" class="paste-area-format" style="display:none" contenteditable="true" data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."></div>
`.trim();

/**
 * Table grid, format preview iframe, and format paste area are fully owned by `js/datacapture.js`
 * (`initializeTable`, `toggleTableDisplayForFormat`, etc.). This shell never re-renders after mount.
 */
const LegacyDataCaptureGrid = memo(function LegacyDataCaptureGrid() {
  const hostRef = useRef(null);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el || el.dataset.dcLegacyInjected === "1") return;
    el.innerHTML = LEGACY_GRID_HTML;
    el.dataset.dcLegacyInjected = "1";
  }, []);

  return <div ref={hostRef} className="legacy-data-capture-grid-host" style={{ display: "contents" }} />;
}, () => true);

/**
 * Bottom section: capture type, reset, legacy grid, submit.
 * API / behavior unchanged — still driven by `datacapture.js` after `initDataCapturePage`.
 */
import { CAPTURE_TYPE_OPTIONS } from "./dataCaptureTypeConstants.js";

export default function DataCaptureTableSection({
  captureType,
  citibetMode = false,
  formatGridReady = false,
  onCaptureTypeChange,
  submitDisabled = true,
  onSubmit,
  onReset,
}) {
  const showFormatPasteHint = captureType === "2.Format" && !formatGridReady;

  return (
    <div className="bottom-section">
      <div className={`excel-table-container${citibetMode ? " citibet-mode" : ""}`}>
        <div className="excel-table-header">
          <span>Data Capture Table</span>
          {showFormatPasteHint ? (
            <span className="dc-format-paste-hint" style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
              Paste a formatted table below
            </span>
          ) : null}
          <select
            id="dataCaptureTypeSelector"
            className="data-capture-type-selector"
            value={captureType}
            onChange={onCaptureTypeChange}
            aria-label="Data capture format"
          >
            {CAPTURE_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "1.Text"
                  ? "1.TEXT"
                  : opt === "2.Format"
                    ? "2.FORMAT"
                    : opt === "CITIBET"
                      ? "3.CITIBET"
                      : "4.RETURN"}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-cancel" onClick={() => (onReset ? onReset() : window.resetForm?.())}>
            Reset
          </button>
        </div>
        <LegacyDataCaptureGrid />
      </div>

      <div className="form-actions">
        <button
          id="dataCaptureSubmitBtn"
          type="button"
          className="btn btn-save"
          disabled={submitDisabled}
          style={{
            opacity: submitDisabled ? 0.6 : 1,
            cursor: submitDisabled ? "not-allowed" : "pointer",
          }}
          onClick={() => {
            if (onSubmit) {
              void onSubmit();
              return;
            }
            void window.submitDataCaptureForm?.();
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
