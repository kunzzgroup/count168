import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { fetchSubmissionsByCaptureDate } from "./dataCaptureApi.js";

export function useDataCaptureSubmittedList(companyId, captureDate) {
  const [items, setItems] = useState([]);

  const refreshSubmitted = useCallback(async () => {
    if (!companyId) {
      setItems([]);
      return;
    }
    try {
      const res = await fetchSubmissionsByCaptureDate(captureDate, companyId);
      if (res.success) {
        setItems(Array.isArray(res.data) ? res.data : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  }, [companyId, captureDate]);

  useEffect(() => {
    void refreshSubmitted();
  }, [refreshSubmitted]);

  useLayoutEffect(() => {
    window.__DC_REFRESH_SUBMITTED_PROCESSES__ = refreshSubmitted;
    return () => {
      try {
        delete window.__DC_REFRESH_SUBMITTED_PROCESSES__;
      } catch {
        window.__DC_REFRESH_SUBMITTED_PROCESSES__ = undefined;
      }
    };
  }, [refreshSubmitted]);

  return { submittedItems: items, refreshSubmitted };
}
