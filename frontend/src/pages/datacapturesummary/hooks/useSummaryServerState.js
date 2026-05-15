import { useEffect, useRef } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";

function stableRowKey(row) {
  return `${row.idProduct}::${row.originalRowIndex}`;
}

function buildSavePayload(summaryRows, processMeta) {
  const rowsByStableKey = {};
  summaryRows.forEach((r) => {
    rowsByStableKey[stableRowKey(r)] = {
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
    rowOrder: summaryRows.map((r) => stableRowKey(r)),
    savedAt: Date.now(),
  };
}

export function useSummaryServerState({ enabled, companyId, processMeta, summaryRows }) {
  const timerRef = useRef(null);
  const navigatingRef = useRef(false);

  useEffect(() => {
    const onSubmitStart = () => {
      navigatingRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    window.addEventListener("datacapture-summary-submit-start", onSubmitStart);
    return () => window.removeEventListener("datacapture-summary-submit-start", onSubmitStart);
  }, []);

  useEffect(() => {
    if (!enabled || !processMeta.processId || navigatingRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (navigatingRef.current) return;
      const payload = buildSavePayload(summaryRows, processMeta);
      const baseUrl = buildApiUrl("api/datacapture_summary/summary_api.php?action=save_summary_state");
      const url = companyId ? `${baseUrl}&company_id=${encodeURIComponent(String(companyId))}` : baseUrl;
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 900);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [companyId, enabled, processMeta.processCode, processMeta.processId, summaryRows]);
}
