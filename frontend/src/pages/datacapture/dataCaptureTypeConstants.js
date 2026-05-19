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

export function isCitibetCaptureType(captureType) {
  return normalizeCaptureType(captureType) === "CITIBET";
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
