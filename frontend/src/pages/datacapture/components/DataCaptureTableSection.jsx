import { useLayoutEffect } from "react";
import DataCaptureGrid from "./DataCaptureGrid.jsx";
import { CAPTURE_TYPE_OPTIONS } from "../lib/dataCaptureFormRules.js";
import { translateDataCaptureMessage } from "../../../translateFile/pages/dataCaptureTranslate.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";

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
  mutationsBlocked = false,
  onSubmit,
  onReset,
}) {
  useLayoutEffect(() => {
    window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
  }, [captureType]);

  const submitBlocked = submitDisabled || mutationsBlocked;
  const blockReasonText =
    submitBlockReason &&
    translateDataCaptureMessage(localStorage.getItem("login_lang") === "zh" ? "zh" : "en", submitBlockReason);

  const handleSubmitClick = () => {
    window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
    window.__DC_RECOMPUTE_SUBMIT_STATE__?.();

    if (mutationsBlocked) {
      pushDataCaptureNotification(t("readOnlyBlocked"), "danger");
      return;
    }

    if (onSubmit) {
      void onSubmit();
      return;
    }
    void window.__DC_SUBMIT__?.();
  };

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
          aria-disabled={submitBlocked || undefined}
          title={submitBlocked && blockReasonText ? blockReasonText : undefined}
          style={{
            opacity: submitBlocked ? 0.6 : 1,
            cursor: "pointer",
          }}
          onClick={handleSubmitClick}
        >
          {t("submit")}
        </button>
        {submitBlocked && blockReasonText ? (
          <p className="dc-submit-block-hint" role="status">
            {blockReasonText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
