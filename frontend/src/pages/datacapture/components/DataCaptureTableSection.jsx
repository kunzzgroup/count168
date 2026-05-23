import DataCaptureGrid from "./DataCaptureGrid.jsx";
import { CAPTURE_TYPE_OPTIONS } from "../lib/dataCaptureFormRules.js";

/**
 * Bottom section: capture type, grid, submit.
 */
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
          <div className="dc-table-header-controls">
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
        </div>
        <DataCaptureGrid />
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
