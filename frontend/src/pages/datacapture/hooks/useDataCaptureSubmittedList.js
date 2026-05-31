import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchSubmissionsByCaptureDate } from "../lib/dataCaptureApi.js";
import { dataCaptureScopeIsReady } from "../lib/dataCaptureScope.js";

export function useDataCaptureSubmittedList(captureScope, captureDate) {
  const [items, setItems] = useState([]);

  const refreshSubmitted = useCallback(async () => {
    if (!dataCaptureScopeIsReady(captureScope)) {
      setItems([]);
      return;
    }
    try {
      const res = await fetchSubmissionsByCaptureDate(captureDate, captureScope);
      if (res.success) {
        setItems(Array.isArray(res.data) ? res.data : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  }, [captureScope, captureDate]);

  const refreshRef = useRef(refreshSubmitted);
  refreshRef.current = refreshSubmitted;

  useEffect(() => {
    void refreshSubmitted();
  }, [refreshSubmitted]);

  useLayoutEffect(() => {
    window.__DC_REFRESH_SUBMITTED_PROCESSES__ = async () => {
      await refreshRef.current();
    };
    return () => {
      try {
        delete window.__DC_REFRESH_SUBMITTED_PROCESSES__;
      } catch {
        window.__DC_REFRESH_SUBMITTED_PROCESSES__ = undefined;
      }
    };
  }, []);

  return { submittedItems: items, refreshSubmitted };
}
