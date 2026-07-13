/**
 * Universal Smart Paste feature flag.
 * Enable: VITE_SMART_PASTE_UNIVERSAL=1 or localStorage SMART_PASTE_UNIVERSAL=1
 * Default: off (existing paste routes unchanged).
 */

const STORAGE_KEY = "SMART_PASTE_UNIVERSAL";

export function isSmartPasteUniversalEnabled() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SMART_PASTE_UNIVERSAL === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Capture types Universal must not intercept (formula / sensitive layouts). */
export const SMART_PASTE_SKIP_CAPTURE_TYPES = new Set(["4.RETURN", "API_RETURN"]);

/**
 * 2.Format with rich HTML styles should keep the existing format pipeline.
 * Plain TSV / simple tables may use Universal.
 */
export function shouldSkipUniversalForFormat(captureType, captured) {
  if (captureType !== "2.Format") return false;
  const html = String(captured?.html || "");
  if (!html.trim()) return false;
  // Styled / format-fidelity HTML → leave to handleFormatCellPaste
  if (/style\s*=/i.test(html) || /<style[\s>]/i.test(html)) return true;
  if (/class\s*=\s*["'][^"']*(?:mat-|cdk-|ag-|k-grid)/i.test(html) && /style\s*=/i.test(html)) {
    return true;
  }
  return false;
}
