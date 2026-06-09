import { useCallback, useEffect, useRef } from "react";

import { populateSummaryRowsPure } from "../table/summaryTemplatePopulatePure.js";

import { bindSummaryFormulaContext } from "../lib/summaryFormulaContext.js";

import { fetchSummaryAccountList } from "../lib/summaryApi.js";

import { useSummaryContext } from "../context/SummaryContext.jsx";

import { stripSummarySuccessParamFromUrl } from "../lib/summaryStorage.js";

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

  const { replaceRows, setDataPopulating, setAccounts, resetToRows, setTableChromeVisible } =

    useSummaryContext();

  const populateStartedRef = useRef(false);

  const inFlightRef = useRef(false);



  const runPopulate = useCallback(

    async (options = {}) => {

      if (!enabled || !hasCaptureData || !tableData || inFlightRef.current) return false;

      inFlightRef.current = true;

      setDataPopulating(true);



      try {

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



        if (options.reset) {

          resetToRows([]);

          setTableChromeVisible(false);

        }



        const accounts = await fetchSummaryAccountList(captureScope);

        setAccounts(accounts);



        const rows = await populateSummaryRowsPure({

          tableData,

          processId,

          companyId,

          captureScope,

          captureId: readCaptureId(),

          serverState,

          freshFromCapture,

        });



        replaceRows(rows);

        setTableChromeVisible(true);

        document.body.classList.add("page-ready");



        if (freshFromCapture && searchParams?.get("success") === "1") {

          stripSummarySuccessParamFromUrl();

          pushSummaryNotification(

            t?.("success") || "Success",

            t?.("captureLoaded") || "Capture data loaded.",

            "success"

          );

        }



        return true;

      } catch (error) {

        console.error("Pure summary populate failed:", error);

        populateStartedRef.current = false;

        pushSummaryNotification(

          t?.("error") || "Error",

          error?.message || t?.("loadPageFailed") || "Failed to load summary table.",

          "error"

        );

        return false;

      } finally {

        inFlightRef.current = false;

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

      resetToRows,

      setAccounts,

      setDataPopulating,

      setTableChromeVisible,

    ]

  );



  useEffect(() => {

    if (!enabled || !hasCaptureData || !tableData) return;

    if (populateStartedRef.current) return;

    populateStartedRef.current = true;

    void runPopulate();

  }, [enabled, hasCaptureData, tableData, runPopulate]);



  return { runPopulate };

}

