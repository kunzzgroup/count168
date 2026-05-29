import { loadActiveCaptureSession, CAPTURE_SCOPE_POINTER_KEY } from "../../datacapture/lib/dataCaptureStorage.js";
import { dataCaptureScopeCacheCompanyKey } from "../../datacapture/lib/dataCaptureScope.js";
export const SUMMARY_CAPTURE_STORAGE_KEYS = [
  "capturedTableData",
  "capturedProcessData",
  "capturedDataCaptureType",
  "capturedFormatPreviewHtml",
  "captured655PreviewHtml",
  "capturedTableRateValues",
  "capturedTableFormulaSourceForRefresh",
  "capturedCaptureId",
];

export const SUMMARY_RATE_VALUES_KEY = "capturedTableRateValues";
export const SUMMARY_FORMULA_SOURCE_KEY = "capturedTableFormulaSourceForRefresh";
export const SUMMARY_CAPTURE_ID_KEY = "capturedCaptureId";
const SUMMARY_FRESH_NAV_KEY = "dc_summary_fresh_nav";

export function markSummaryFreshNavigation() {
  try {
    sessionStorage.setItem(SUMMARY_FRESH_NAV_KEY, "1");
  } catch {
    /* ignore */
  }
  window.isNavigatingAwayByBackOrSubmit = true;
}

export function consumeSummaryFreshNavigation() {
  try {
    if (sessionStorage.getItem(SUMMARY_FRESH_NAV_KEY) === "1") {
      sessionStorage.removeItem(SUMMARY_FRESH_NAV_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function clearSummaryCaptureRoundStorage() {
  try {
    const session = loadActiveCaptureSession();
    const scopeKey = session?.processData
      ? dataCaptureScopeCacheCompanyKey({
          mode: session.processData.groupOnlyCapture ? "group" : "company",
          scopeCompanyId: session.processData.scopeCompanyId,
          groupId: session.processData.captureSelectedGroup,
        })
      : localStorage.getItem(CAPTURE_SCOPE_POINTER_KEY);

    for (const key of SUMMARY_CAPTURE_STORAGE_KEYS) {
      localStorage.removeItem(key);
      if (scopeKey != null) {
        localStorage.removeItem(`${key}:${scopeKey}`);
      }
      if (key === "capturedFormatPreviewHtml" || key === "captured655PreviewHtml") {
        sessionStorage.removeItem(key);
      }
    }
    localStorage.removeItem(CAPTURE_SCOPE_POINTER_KEY);
  } catch {
    /* ignore */
  }
}

export function isSummaryFreshFromCapture(searchParams) {
  return searchParams?.get("success") === "1";
}

export function stripSummarySuccessParamFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("success") && !url.searchParams.has("error")) return;
    url.searchParams.delete("success");
    url.searchParams.delete("error");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function readCaptureSessionFromStorage() {
  const session = loadActiveCaptureSession();
  if (!session) return null;
  return {
    tableData: session.tableData,
    processData: session.processData,
  };
}

/** Fresh capture round: drop stale captureId before rendering summary. */
export function clearStaleCaptureIdForFreshRound() {
  try {
    localStorage.removeItem(SUMMARY_CAPTURE_ID_KEY);
  } catch {
    /* ignore */
  }
}
