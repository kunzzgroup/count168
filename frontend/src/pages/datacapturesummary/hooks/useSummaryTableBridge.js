import { useLayoutEffect } from "react";
import { buildColumnAEntries } from "../summaryColumnAData.js";
import {
  runSummaryTablePostPopulate,
  showSummarySuccessNotificationIfNeeded,
} from "../summaryTablePostPopulate.js";

/**
 * Registers legacy SPA bridges so initDataCaptureSummaryPage skips DOM table build
 * and delegates post-populate to React-rendered rows.
 */
export function useSummaryTableBridge({ tableData, hasCaptureData, processData, syncFromDom }) {
  useLayoutEffect(() => {
    window.__SUMMARY_REACT_TABLE__ = true;

    window.__SUMMARY_REACT_ON_TABLE_READY__ = async () => {
      if (!hasCaptureData || !tableData) return;
      try {
        const { idProducts } = buildColumnAEntries(tableData);
        window.rebuildUsedAccountIds?.();
        await runSummaryTablePostPopulate(idProducts);
        syncFromDom?.();
        window.updateHeaderCurrencyFromSummaryTable?.();
      } finally {
        showSummaryTableChrome();
      }
    };

    return () => {
      delete window.__SUMMARY_REACT_TABLE__;
      delete window.__SUMMARY_REACT_ON_TABLE_READY__;
    };
  }, [tableData, hasCaptureData, syncFromDom]);

  useLayoutEffect(() => {
    if (processData) {
      window.capturedProcessData = processData;
    }
  }, [processData]);
}

export function showSummarySuccessNotificationIfNeededFromReact() {
  showSummarySuccessNotificationIfNeeded();
}

export function showSummaryTableChrome() {
  const loadingState = document.getElementById("loadingState");
  const actionButtons = document.getElementById("actionButtons");
  const summaryTableContainer = document.getElementById("summaryTableContainer");
  const summarySubmitContainer = document.getElementById("summarySubmitContainer");

  if (loadingState) loadingState.style.display = "none";
  if (actionButtons) actionButtons.style.display = "flex";
  if (summaryTableContainer) summaryTableContainer.style.display = "block";
  if (summarySubmitContainer) summarySubmitContainer.style.display = "flex";
}

export function hideSummaryLoadingChrome() {
  const loadingState = document.getElementById("loadingState");
  if (loadingState) loadingState.style.display = "none";
}
