import { prepareSummarySubmitCollection } from "./summarySubmitRowCollection.js";

/** Collect submit rows from the current summary table DOM. */
export async function collectSummarySubmitRows() {
  let processData = null;
  try {
    const raw = localStorage.getItem("capturedProcessData");
    processData = raw ? JSON.parse(raw) : null;
  } catch {
    return [];
  }
  if (!processData) return [];
  const prep = await prepareSummarySubmitCollection(processData);
  return prep.ok ? prep.rows : [];
}

export function buildSummarySubmitPayload(processData, summaryRows) {
  if (!processData) return null;
  const groupOnly = processData.groupOnlyCapture === true;
  return {
    captureDate: processData.date,
    processId: processData.process,
    processName: processData.processName,
    processCode: processData.processCode || processData.process_code || "",
    currencyId: processData.currency,
    currencyName: processData.currencyName,
    remark: processData.remark || "",
    groupOnlyCapture: groupOnly,
    captureSelectedGroup: groupOnly
      ? String(processData.captureSelectedGroup || "").trim().toUpperCase()
      : undefined,
    captureScopeMode: groupOnly ? "group" : "company",
    summaryRows: Array.isArray(summaryRows) ? summaryRows : [],
  };
}
