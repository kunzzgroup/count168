import { captureTableHasData, tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";

export const CAPTURE_TYPE_OPTIONS = ["1.Text", "2.Format", "CITIBET", "4.RETURN"];

/** Align with `normalizeCaptureTypeValue` in `js/datacapture.js`. */
export function normalizeCaptureType(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (s === "1.GENERAL") s = "1.Text";
  if (s === "655") s = "2.Format";
  if (s === "CITIBET_MAJOR") s = "CITIBET";
  return CAPTURE_TYPE_OPTIONS.includes(s) ? s : "";
}

export function readInitialCaptureType() {
  const url = new URLSearchParams(window.location.search);
  if (url.get("restore") === "1") {
    try {
      const pd = JSON.parse(localStorage.getItem("capturedProcessData") || "null");
      const fromStore =
        pd?.dataCaptureType || pd?.captureType || localStorage.getItem("capturedDataCaptureType") || "";
      const normalized = normalizeCaptureType(fromStore);
      if (normalized) return normalized;
    } catch {
      /* ignore */
    }
  }
  const v = String(url.get("captureType") || url.get("dataCaptureType") || "").trim();
  return normalizeCaptureType(v) || "1.Text";
}

export function isCitibetCaptureType(captureType) {
  return normalizeCaptureType(captureType) === "CITIBET";
}

const DESCRIPTION_PLACEHOLDER_PATTERNS = [
  /^click\s*\+\s*to\s*select/i,
  /^select\s*description/i,
  /^点击.*选择.*描述/i,
  /^请选择.*描述/i,
];

function isDescriptionPlaceholder(text) {
  const s = String(text || "").trim();
  if (!s) return true;
  return DESCRIPTION_PLACEHOLDER_PATTERNS.some((re) => re.test(s));
}

/** Descriptions from modal/global state, with fallback when display text is set but array is empty. */
export function getActiveDescriptions(descriptionDisplay) {
  const fromWindow = Array.isArray(window.selectedDescriptions) ? window.selectedDescriptions : [];
  const cleanedWindow = fromWindow.map((s) => String(s || "").trim()).filter((s) => s && !isDescriptionPlaceholder(s));
  if (cleanedWindow.length) return cleanedWindow;
  const display = String(descriptionDisplay || "").trim();
  if (!display || isDescriptionPlaceholder(display)) return [];
  return display
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !isDescriptionPlaceholder(s));
}

export function validateDataCaptureForm({
  selectedProcess,
  descriptions,
  descriptionDisplay,
  currencyId,
  captureType,
  tableData,
}) {
  const activeDescriptions = descriptions?.length
    ? descriptions
    : getActiveDescriptions(descriptionDisplay);

  const resolvedDescriptions =
    activeDescriptions.length > 0
      ? activeDescriptions
      : selectedProcess?.description_name
        ? [String(selectedProcess.description_name).trim()].filter(Boolean)
        : [];

  if (!selectedProcess?.id) {
    return { ok: false, message: "Please select a process" };
  }
  if (!resolvedDescriptions.length) {
    return { ok: false, message: "Please select at least one description" };
  }
  if (!currencyId) {
    return { ok: false, message: "Please select a currency" };
  }
  if (isCitibetCaptureType(captureType) && !captureTableHasData(tableData, captureType)) {
    return { ok: false, message: "Please enter data in the table" };
  }
  const normalizedType = normalizeCaptureType(captureType);
  if (
    (normalizedType === "1.Text" || normalizedType === "2.Format") &&
    !captureTableHasData(tableData, captureType)
  ) {
    return { ok: false, message: "Please enter data in the table" };
  }
  return { ok: true };
}

export function isSubmitReady(params) {
  return validateDataCaptureForm(params).ok;
}
