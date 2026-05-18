import { memo } from "react";

/**
 * Table grid, format preview iframe, and format paste area are fully owned by `js/datacapture.js`
 * (`initializeTable`, `toggleTableDisplayForFormat`, etc.). This shell never re-renders after mount
 * so React reconciliation cannot wipe legacy-inserted `<tr>` / cells.
 */
const LegacyDataCaptureGrid = memo(function LegacyDataCaptureGrid() {
  return (
    <>
      <table className="excel-table" id="dataTable">
        <thead id="tableHeader">
          <tr>
            <th />
          </tr>
        </thead>
        <tbody id="tableBody" />
      </table>
      <div id="tablePreviewFormat" className="table-preview-format" style={{ display: "none" }}>
        <iframe id="tablePreviewFrameFormat" className="table-preview-frame-format" title="Format Table Preview" />
      </div>
      <div
        id="pasteAreaFormat"
        className="paste-area-format"
        style={{ display: "none" }}
        contentEditable
        data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
        suppressContentEditableWarning
      />
    </>
  );
}, () => true);

/**
 * Bottom section: capture type, reset, legacy grid, submit.
 * API / behavior unchanged — still driven by `datacapture.js` after `initDataCapturePage`.
 */
export default function DataCaptureTableSection({ captureType, onCaptureTypeChange }) {
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
            <option value="CITIBET">CITIBET</option>
            <option value="CITIBET_MAJOR">3.CITIBET</option>
            <option value="4.RETURN">4.RETURN</option>
          </select>
          <button type="button" className="btn btn-cancel" onClick={() => window.resetForm?.()}>
            Reset
          </button>
        </div>
        <LegacyDataCaptureGrid />
      </div>

      <div className="form-actions">
        <button id="dataCaptureSubmitBtn" type="submit" className="btn btn-save" onClick={() => window.submitDataCaptureForm?.()}>
          Submit
        </button>
      </div>
    </div>
  );
}
