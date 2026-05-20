import { assetUrl } from "../../../utils/apiUrl.js";

export default function SummarySubmitBar({
  submitting = false,
  onSubmit,
  onBack,
  onRefresh,
}) {
  return (
    <div className="summary-submit-container" id="summarySubmitContainer" style={{ display: "none" }}>
      <button
        type="button"
        className="btn btn-submit"
        id="summarySubmitBtn"
        onClick={onSubmit}
        disabled={submitting}
      >
        {submitting ? "提交中..." : "Submit"}
      </button>
      <button type="button" className="btn btn-cancel" onClick={onBack} style={{ marginLeft: 10 }}>
        Back
      </button>
      <button type="button" className="btn btn-refresh" onClick={onRefresh} title="Refresh page">
        <img
          src={assetUrl("images/refresh.svg")}
          alt="Refresh"
          style={{ width: "clamp(23px, 1.8vw, 35px)", height: "clamp(23px, 1.8vw, 35px)" }}
        />
      </button>
    </div>
  );
}
