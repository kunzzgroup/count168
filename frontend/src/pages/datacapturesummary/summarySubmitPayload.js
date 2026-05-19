/**
 * Future home for DOM → API submit payload. Phase 5: bridge to legacy collector.
 */
export async function collectSummarySubmitRows() {
  if (typeof window.__SUMMARY_COLLECT_SUBMIT_ROWS__ === "function") {
    const rows = await window.__SUMMARY_COLLECT_SUBMIT_ROWS__();
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

export function buildSummarySubmitPayload(processData, summaryRows) {
  if (!processData) return null;
  return {
    captureDate: processData.date,
    processId: processData.process,
    processName: processData.processName,
    currencyId: processData.currency,
    currencyName: processData.currencyName,
    remark: processData.remark || "",
    summaryRows: Array.isArray(summaryRows) ? summaryRows : [],
  };
}
