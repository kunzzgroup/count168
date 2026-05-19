import { buildSummarySubmitPayload } from "./summarySubmitPayload.js";

/**
 * Prepare submit rows + payload via legacy collector (async).
 * @returns {Promise<{ ok: boolean, warning?: boolean, message?: string, payload?: object, rows?: object[] }>}
 */
export async function prepareSummarySubmitPayload() {
  if (typeof window.__SUMMARY_PREPARE_SUBMIT_COLLECTION__ !== "function") {
    return { ok: false, message: "Summary submit engine not ready." };
  }

  let processData = null;
  try {
    const raw = localStorage.getItem("capturedProcessData");
    processData = raw ? JSON.parse(raw) : null;
  } catch {
    processData = null;
  }

  if (!processData) {
    return { ok: false, message: "No process data found. Please return to Data Capture page." };
  }

  const prep = await window.__SUMMARY_PREPARE_SUBMIT_COLLECTION__(processData);
  if (!prep?.ok) {
    return {
      ok: false,
      warning: !!prep?.warning,
      message: prep?.message || "Failed to prepare summary rows.",
      rows: prep?.rows || [],
    };
  }

  const payload = buildSummarySubmitPayload(processData, prep.rows);
  return { ok: true, payload, rows: prep.rows };
}
