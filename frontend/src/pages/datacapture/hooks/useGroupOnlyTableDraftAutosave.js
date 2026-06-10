import { useEffect, useLayoutEffect, useRef } from "react";
import { getBridgeCaptureType } from "../lib/dataCaptureBridge.js";
import { saveGroupOnlyTableDraft } from "../lib/dataCaptureGroupOnlyTableDraft.js";
import { isGroupOnlyProcessId } from "../lib/dataCaptureGroupOnlyProcesses.js";
import { captureTableSnapshot } from "../lib/dataCaptureTableSnapshot.js";
import { getDataCaptureState } from "../lib/dataCaptureRuntime.js";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";

/**
 * Debounced server sync when the group-only capture grid changes.
 * Only reacts to grid edits — not process selection alone — so switching
 * process cannot snapshot the previous process grid into the new key.
 */
export function useGroupOnlyTableDraftAutosave({
  enabled,
  captureScope,
  selectedGroup,
  selectedProcessId,
  captureType,
}) {
  const { gridVersion } = useDataCaptureContext();
  const processIdRef = useRef(selectedProcessId);
  const skipAfterRestoreRef = useRef(false);

  processIdRef.current = selectedProcessId;

  useLayoutEffect(() => {
    skipAfterRestoreRef.current = true;
  }, [selectedProcessId]);

  useEffect(() => {
    if (!enabled || !selectedGroup || !processIdRef.current) return;
    if (!isGroupOnlyProcessId(processIdRef.current)) return;
    if (getDataCaptureState().isRestoring) {
      skipAfterRestoreRef.current = true;
      return;
    }
    try {
      if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    } catch {
      /* ignore */
    }

    if (skipAfterRestoreRef.current) {
      skipAfterRestoreRef.current = false;
      return;
    }

    const activeCaptureType = getBridgeCaptureType(captureType || "1.Text");
    const tableData = captureTableSnapshot(activeCaptureType);
    saveGroupOnlyTableDraft(
      selectedGroup,
      processIdRef.current,
      {
        tableData,
        captureType: activeCaptureType,
      },
      { captureScope },
    );
  }, [enabled, captureScope, selectedGroup, captureType, gridVersion]);
}
