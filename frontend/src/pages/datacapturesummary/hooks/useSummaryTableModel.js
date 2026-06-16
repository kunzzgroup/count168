import { useCallback, useLayoutEffect, useRef } from "react";

import {
  buildInitialSummaryRows,
  populateSummaryRowsPure,
} from "../table/summaryTemplatePopulatePure.js";

import { bindSummaryFormulaContext } from "../lib/summaryFormulaContext.js";

import {
  consumePrefetchedAccounts,
  consumePrefetchedTemplates,
} from "../lib/summaryPrefetch.js";

import { useSummaryContext } from "../context/SummaryContext.jsx";

import { stripSummarySuccessParamFromUrl } from "../lib/summaryStorage.js";

import {
  saveSummaryRefreshStatePure,
  clearSummaryRefreshDraftStorage,
} from "../lib/summaryRefreshStatePure.js";

import { loadSummarySessionSnapshot } from "../lib/summaryRefreshStatePure.js";

import { restoreRateValuesOnRows } from "../lib/summaryRefreshRestore.js";

import { mapRowsWithAmountRecalc } from "../table/summaryRowAmount.js";

import { pushSummaryNotification } from "../lib/summaryNotify.js";

function readCaptureId() {
  try {
    const stored = localStorage.getItem("capturedCaptureId");
    if (stored != null && stored !== "") {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Pure React table populate — replaces useSummaryTablePopulate + legacy init.
 */
export function useSummaryTableModel({
  enabled,
  tableData,
  hasCaptureData,
  processId,
  processCode,
  processData,
  companyId,
  captureScope,
  freshFromCapture,
  serverState,
  searchParams,
  t,
}) {
  const { replaceRows, setDataPopulating, setAccounts, setTableChromeVisible } =
    useSummaryContext();

  const populateStartedRef = useRef(false);
  const populateChainRef = useRef(Promise.resolve());

  const processMeta = { processId, processCode };

  const executePopulate = useCallback(
    async () => {
      if (!enabled || !hasCaptureData || !tableData) return false;

      setDataPopulating(true);

      try {
        if (freshFromCapture) {
          clearSummaryRefreshDraftStorage(captureScope, processMeta);
        }

        bindSummaryFormulaContext({
          tableData,
          processData,
          processId,
          processCode,
          companyId,
          captureScope,
          serverState,
          freshFromCapture,
        });

        const accounts = await consumePrefetchedAccounts(captureScope);

        if (!freshFromCapture) {
          const snapshot = loadSummarySessionSnapshot(captureScope, processMeta);
          if (snapshot?.rows?.length) {
            let rows = restoreRateValuesOnRows(snapshot.rows, captureScope);
            rows = mapRowsWithAmountRecalc(rows);
            setAccounts(accounts);
            replaceRows(rows);
            saveSummaryRefreshStatePure(rows, processMeta, captureScope);
            setTableChromeVisible(true);
            document.body.classList.add("page-ready");
            return true;
          }
        }

        const captureId = readCaptureId();
        const rows = await populateSummaryRowsPure({
          tableData,
          processId,
          processCode,
          companyId,
          captureScope,
          captureId,
          serverState,
          freshFromCapture,
          loadTemplates: () =>
            consumePrefetchedTemplates({
              captureScope,
              companyId,
              processId,
              tableData,
              captureId,
            }),
        });

        setAccounts(accounts);
        replaceRows(rows);

        saveSummaryRefreshStatePure(rows, processMeta, captureScope);

        setTableChromeVisible(true);

        document.body.classList.add("page-ready");

        if (freshFromCapture && searchParams?.get("success") === "1") {
          stripSummarySuccessParamFromUrl();
        }

        return true;
      } catch (error) {
        console.error("Pure summary populate failed:", error);

        pushSummaryNotification(
          t?.("error") || "Error",
          error?.message || t?.("loadPageFailed") || "Failed to load summary table.",
          "error"
        );
        return false;
      } finally {
        setDataPopulating(false);
      }
    },
    [
      enabled,
      hasCaptureData,
      tableData,
      processId,
      processCode,
      processData,
      companyId,
      captureScope,
      freshFromCapture,
      serverState,
      searchParams,
      t,
      replaceRows,
      setAccounts,
      setDataPopulating,
      setTableChromeVisible,
    ]
  );

  const runPopulate = useCallback(() => {
    const task = populateChainRef.current.then(() => executePopulate());
    populateChainRef.current = task.catch(() => {});
    return task;
  }, [executePopulate]);

  useLayoutEffect(() => {
    if (!enabled || !hasCaptureData || !tableData) return;
    if (populateStartedRef.current) return;

    populateStartedRef.current = true;

    const skeletonRows = buildInitialSummaryRows(tableData);
    if (skeletonRows.length) {
      replaceRows(skeletonRows);
    }
    setTableChromeVisible(true);

    void runPopulate();
  }, [enabled, hasCaptureData, tableData, runPopulate, replaceRows, setTableChromeVisible]);

  return { runPopulate };
}
