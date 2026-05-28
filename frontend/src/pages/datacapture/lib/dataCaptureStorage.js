import {
  isCitibetCaptureType,
  normalizeCaptureType as normalizeStoredCaptureType,
} from "./dataCaptureFormRules.js";
import {
  isDashboardGroupOnlyMode,
  persistDashboardGroupFilter,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { saveGroupOnlyProcessPrefsFromProcessData } from "./dataCaptureGroupOnlyProcessPersistence.js";

export const CAPTURE_TABLE_STORAGE_KEY = "capturedTableData";
export const CAPTURE_PROCESS_STORAGE_KEY = "capturedProcessData";
export const CAPTURE_TYPE_STORAGE_KEY = "capturedDataCaptureType";

export { normalizeStoredCaptureType, isCitibetCaptureType };

export function saveCaptureSession(tableData, processData, captureType, context = {}) {
  const type = normalizeStoredCaptureType(captureType || processData?.dataCaptureType) || "1.Text";
  const groupOnlyCapture = context.groupOnly === true;
  const captureSelectedGroup = context.selectedGroup
    ? String(context.selectedGroup).trim().toUpperCase()
    : null;
  localStorage.setItem(CAPTURE_TABLE_STORAGE_KEY, JSON.stringify(tableData));
  localStorage.setItem(
    CAPTURE_PROCESS_STORAGE_KEY,
    JSON.stringify({
      ...processData,
      dataCaptureType: type,
      groupOnlyCapture,
      captureSelectedGroup,
    })
  );
  localStorage.setItem(CAPTURE_TYPE_STORAGE_KEY, type);
  if (groupOnlyCapture) {
    saveGroupOnlyProcessPrefsFromProcessData(
      { ...processData, dataCaptureType: type, groupOnlyCapture, captureSelectedGroup },
      captureSelectedGroup
    );
  }
}

/** Metadata saved with the last capture session (group-only back navigation). */
export function readCaptureSessionMeta() {
  try {
    const processDataStr = localStorage.getItem(CAPTURE_PROCESS_STORAGE_KEY);
    if (!processDataStr) return null;
    const processData = JSON.parse(processDataStr);
    return {
      groupOnlyCapture: processData.groupOnlyCapture === true,
      captureSelectedGroup: processData.captureSelectedGroup
        ? String(processData.captureSelectedGroup).trim().toUpperCase()
        : null,
    };
  } catch {
    return null;
  }
}

export function isGroupOnlyCaptureRestoreRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("group_only") === "1") return true;
  const meta = readCaptureSessionMeta();
  if (meta?.groupOnlyCapture) return true;
  return isDashboardGroupOnlyMode() && params.get("restore") === "1";
}

/** Re-apply dashboard group-only filter before restoring table/form from storage. */
export function applyGroupOnlyCaptureRestoreFilter(processData) {
  const meta = readCaptureSessionMeta();
  const groupRaw =
    processData?.captureSelectedGroup || meta?.captureSelectedGroup || null;
  const group = groupRaw ? String(groupRaw).trim().toUpperCase() : null;
  if (group) persistDashboardGroupFilter(group);
  persistDashboardGroupOnlyMode(true);
  persistDashboardSelectedCompany(null);
  stripSearchParamsFromUrl(["company_id", "group_only"]);
  return group;
}

export function loadCaptureSession() {
  try {
    const tableDataStr = localStorage.getItem(CAPTURE_TABLE_STORAGE_KEY);
    const processDataStr = localStorage.getItem(CAPTURE_PROCESS_STORAGE_KEY);
    if (!tableDataStr || !processDataStr) return null;
    const tableData = JSON.parse(tableDataStr);
    const processData = JSON.parse(processDataStr);
    const savedTypeRaw =
      processData?.dataCaptureType ||
      processData?.captureType ||
      localStorage.getItem(CAPTURE_TYPE_STORAGE_KEY) ||
      "1.Text";
    return {
      tableData,
      processData,
      captureType: normalizeStoredCaptureType(savedTypeRaw) || "1.Text",
    };
  } catch {
    return null;
  }
}

export function shouldRestoreFromUrl() {
  return new URLSearchParams(window.location.search).get("restore") === "1";
}

export function stripRestoreParamFromUrl() {
  stripSearchParamsFromUrl(["restore"]);
}

export function stripSearchParamsFromUrl(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  try {
    const url = new URL(window.location.href);
    keys.forEach((key) => url.searchParams.delete(key));
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}
