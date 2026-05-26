import { loadCaptureSession } from "../../datacapture/lib/dataCaptureStorage.js";
import { saveGroupOnlyProcessPrefsFromProcessData } from "../../datacapture/lib/dataCaptureGroupOnlyProcessPersistence.js";
import { clearSummaryCaptureRoundStorage } from "./summaryStorage.js";

/** Persist formula/source/rate draft caches before refresh or leaving (not final Submit). */
export function saveSummaryRefreshState(options = {}) {
  const includeRateValue = options.includeRateValue !== false;
  if (includeRateValue) {
    window.saveRateValuesForRefresh?.();
  }
  window.saveFormulaSourceForRefresh?.({ includeRateValue });
}

export function buildSummaryRestoreCapturePath(companyId, options = {}) {
  const groupOnly = options.groupOnly === true;
  const params = new URLSearchParams({ restore: "1" });
  if (groupOnly) {
    params.set("group_only", "1");
  } else if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  return `/datacapture?${params.toString()}`;
}

export function buildSummarySubmittedCapturePath(companyId, options = {}) {
  const groupOnly = options.groupOnly === true;
  const params = new URLSearchParams({ submitted: "1" });
  if (groupOnly) {
    params.set("group_only", "1");
  } else if (companyId != null && String(companyId).trim() !== "") {
    params.set("company_id", String(companyId));
  }
  return `/datacapture?${params.toString()}`;
}

/** Clear capture session after successful summary submit (legacy parity). */
export function clearSummarySessionAfterSubmit(options = {}) {
  window.isNavigatingAwayByBackOrSubmit = true;
  if (options.groupOnly === true) {
    const session = loadCaptureSession();
    if (session?.processData) {
      saveGroupOnlyProcessPrefsFromProcessData(session.processData, session.processData.captureSelectedGroup);
    }
  }
  try {
    localStorage.removeItem("capturedTableRateValues");
    localStorage.removeItem("capturedTableRateValuesByProductId");
    localStorage.removeItem("capturedTableFormulaSourceForRefresh");
    localStorage.removeItem("capturedCaptureId");
  } catch {
    /* ignore */
  }
  clearSummaryCaptureRoundStorage();
}

export function runLegacyRateBatchSubmit() {
  window.submitRateValues?.();
}

export function runLegacyRateSelectAll(buttonEl) {
  window.toggleAllRate?.(buttonEl);
}

export function runLegacyDeleteSelectedRows() {
  window.deleteSelectedRows?.();
}

export function runLegacySubmitSummary() {
  window.submitSummaryData?.();
}

export function runLegacyHideNotification() {
  window.hideNotification?.();
}
