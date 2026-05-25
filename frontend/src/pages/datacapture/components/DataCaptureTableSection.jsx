import { useLayoutEffect } from "react";
import DataCaptureGrid from "./DataCaptureGrid.jsx";
import { CAPTURE_TYPE_OPTIONS } from "../lib/dataCaptureFormRules.js";
import { translateDataCaptureMessage } from "../../../translateFile/pages/dataCaptureTranslate.js";

function captureTypeLabel(opt, t) {
  if (opt === "1.Text") return t("captureTypeText");
  if (opt === "2.Format") return t("captureTypeFormat");
  if (opt === "CITIBET") return t("captureTypeCitibet");
  if (opt === "4.RETURN") return t("captureTypeReturn");
  return opt;
}

/**
 * Bottom section: capture type, grid, submit.
 */
export default function DataCaptureTableSection({
  t,
  captureType,
  citibetMode = false,
  onCaptureTypeChange,
  submitDisabled = true,
  submitBlockReason = "",
  onSubmit,
  onReset,
}) {
  useLayoutEffect(() => {
    window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
  }, [captureType]);

  return (
    <div className="bottom-section">
      <div className={`excel-table-container${citibetMode ? " citibet-mode" : ""}`}>
        <div className="excel-table-header">
          <span>{t("dataCaptureTable")}</span>
          <div className="dc-table-header-controls">
            <select
              id="dataCaptureTypeSelector"
              className="data-capture-type-selector"
              value={captureType}
              onChange={onCaptureTypeChange}
              aria-label={t("captureFormatAria")}
            >
              {CAPTURE_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {captureTypeLabel(opt, t)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-cancel" onClick={() => (onReset ? onReset() : window.resetForm?.())}>
              {t("reset")}
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
          title={
            submitDisabled && submitBlockReason
              ? translateDataCaptureMessage(localStorage.getItem("login_lang") === "zh" ? "zh" : "en", submitBlockReason)
              : undefined
          }
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
          {t("submit")}
        </button>
      </div>
    </div>
  );
}
