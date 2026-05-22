import {
  formatSummaryProcessCurrency,
  formatSummaryProcessDescriptions,
} from "../lib/summaryTransform.js";

/**
 * Process metadata bar — React-owned (Phase 1).
 * Legacy displayProcessInfo still runs until table migration; values stay in sync via same processData.
 */
export default function SummaryProcessInfo({ processData, visible = true }) {
  if (!visible || !processData) return null;

  return (
    <div className="process-info-container" id="processInfoContainer">
      <div className="process-info-row">
        <div className="process-info-item">
          <span className="process-info-label">Date:</span>
          <span className="process-info-value" id="processInfoDate">
            {processData.date || "-"}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">Process:</span>
          <span className="process-info-value" id="processInfoProcess">
            {processData.processName || processData.process || "-"}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">Description:</span>
          <span className="process-info-value" id="processInfoDescription">
            {formatSummaryProcessDescriptions(processData)}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">Currency:</span>
          <span className="process-info-value" id="processInfoCurrency">
            {formatSummaryProcessCurrency(processData)}
          </span>
        </div>
        <div className="process-info-item">
          <span className="process-info-label">Remark:</span>
          <span className="process-info-value" id="processInfoRemark">
            {processData.remark || "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
