import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSummaryServerState } from "../summaryApi.js";
import { summaryQueryKeys } from "../summaryQueryKeys.js";
import {
  applyTransformationsToTableData,
  parseSummaryProcessMeta,
} from "../summaryTransform.js";
import {
  clearStaleCaptureIdForFreshRound,
  isSummaryFreshFromCapture,
  readCaptureSessionFromStorage,
} from "../summaryStorage.js";

/**
 * Phase 1: React owns capture-session read + server state prefetch.
 * Legacy script still renders the table; globals are hydrated before init.
 */
export function useSummaryCaptureBootstrap({ companyId, searchParams, enabled }) {
  const freshFromCapture = isSummaryFreshFromCapture(searchParams);

  const captureSession = useMemo(() => {
    if (!enabled) return null;
    return readCaptureSessionFromStorage();
  }, [enabled, freshFromCapture]);

  const transformed = useMemo(() => {
    if (!captureSession) return null;
    const { processData, tableData } = captureSession;
    return applyTransformationsToTableData(
      tableData,
      processData.removeWord,
      processData.replaceWordFrom,
      processData.replaceWordTo
    );
  }, [captureSession]);

  const { processId, processCode, processData } = useMemo(
    () => parseSummaryProcessMeta(captureSession?.processData ?? null),
    [captureSession]
  );

  const serverStateQuery = useQuery({
    queryKey: summaryQueryKeys.serverState(companyId, processId, processCode),
    queryFn: ({ signal }) =>
      fetchSummaryServerState({ companyId, processId, processCode, signal }),
    enabled: enabled && !!captureSession && (processId != null || !!processCode),
    staleTime: 0,
  });

  const hasCaptureData = !!captureSession && !!transformed && !!processData;

  /** Call immediately before legacy initDataCaptureSummaryPage(). */
  function hydrateLegacyGlobals() {
    if (freshFromCapture) {
      clearStaleCaptureIdForFreshRound();
      window.DATACAPTURESUMMARY_CAPTURE_ID = null;
    }

    window.__summaryFreshFromCapture = freshFromCapture;

    if (!hasCaptureData) {
      window.capturedProcessData = null;
      window.transformedTableData = null;
      window.currentProcessId = null;
      window.currentProcessCode = null;
      window._summaryStateFromServer = null;
      return;
    }

    window.capturedProcessData = processData;
    window.transformedTableData = transformed;
    window.currentProcessId = processId;
    window.currentProcessCode = processCode;
    window._summaryStateFromServer = serverStateQuery.data ?? null;
  }

  return {
    freshFromCapture,
    hasCaptureData,
    processData,
    transformedTableData: transformed,
    processId,
    processCode,
    serverState: serverStateQuery.data ?? null,
    serverStateLoading: serverStateQuery.isLoading,
    hydrateLegacyGlobals,
  };
}
