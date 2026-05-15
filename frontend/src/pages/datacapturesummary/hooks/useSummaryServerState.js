import { useEffect, useRef } from "react";
import { buildSummaryStateSavePayload, buildSaveSummaryStateUrl } from "../utils/summaryServerPayload.js";

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
      const payload = buildSummaryStateSavePayload(summaryRows, processMeta);
      const url = buildSaveSummaryStateUrl(companyId);
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

  useEffect(() => {
    const flushSave = () => {
      if (!enabled || !processMeta.processId || navigatingRef.current) return;
      const payload = buildSummaryStateSavePayload(summaryRows, processMeta);
      const url = buildSaveSummaryStateUrl(companyId);
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", flushSave);
    window.addEventListener("beforeunload", flushSave);
    return () => {
      window.removeEventListener("pagehide", flushSave);
      window.removeEventListener("beforeunload", flushSave);
    };
  }, [companyId, enabled, processMeta, summaryRows]);
}
