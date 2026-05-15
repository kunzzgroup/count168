import { buildApiUrl } from "../../../utils/apiUrl.js";

export function stableSummaryRowKey(row) {
  return `${row.idProduct}::${row.originalRowIndex}`;
}

/** Same shape as legacy save_summary_state + js/datacapturesummary dual-write. */
export function buildSummaryStateSavePayload(summaryRows, processMeta) {
  const rowsByStableKey = {};
  summaryRows.forEach((r) => {
    rowsByStableKey[stableSummaryRowKey(r)] = {
      formula: r.formula,
      source: r.source,
      rateValue: r.rateValue,
      rateChecked: r.rateChecked,
      accountId: r.accountId,
      currencyId: r.currencyId,
    };
  });
  return {
    processId: processMeta.processId,
    processCode: processMeta.processCode || "",
    rowsByStableKey,
    rowOrder: summaryRows.map((r) => stableSummaryRowKey(r)),
    savedAt: Date.now(),
  };
}

export function buildSaveSummaryStateUrl(companyId) {
  const baseUrl = buildApiUrl("api/datacapture_summary/summary_api.php?action=save_summary_state");
  return companyId ? `${baseUrl}&company_id=${encodeURIComponent(String(companyId))}` : baseUrl;
}

/** Immediate POST (mirrors legacy refreshPage: save before reload). */
export function postSummaryStateSync(summaryRows, processMeta, companyId) {
  if (!processMeta?.processId) return Promise.resolve();
  const url = buildSaveSummaryStateUrl(companyId);
  const payload = buildSummaryStateSavePayload(summaryRows, processMeta);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  }).catch(() => {});
}
