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
export default function DataCaptureTableSection({
  captureType,
  onCaptureTypeChange,
  submitDisabled = true,
  onSubmit,
  onReset,
}) {
  return (
    <div className="bottom-section">
      <div className="excel-table-container">
        <div className="excel-table-header">
          <span>Data Capture Table</span>
          <select
            id="dataCaptureTypeSelector"
            className="data-capture-type-selector"
            value={captureType}
            onChange={onCaptureTypeChange}
            aria-label="Data capture format"
          >
            <option value="1.Text">1.TEXT</option>
            <option value="2.Format">2.FORMAT</option>
            <option value="CITIBET">3.CITIBET</option>
            <option value="4.RETURN">4.RETURN</option>
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
          type="submit"
          className="btn btn-save"
          disabled={submitDisabled}
          style={{
            opacity: submitDisabled ? 0.6 : 1,
            cursor: submitDisabled ? "not-allowed" : "pointer",
          }}
          onClick={() => (onSubmit ? onSubmit() : window.submitDataCaptureForm?.())}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
