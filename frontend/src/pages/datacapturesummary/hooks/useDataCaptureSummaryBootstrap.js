import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "../../../utils/apiUrl.js";

export function useDataCaptureSummaryBootstrap({
  companyId,
  locationSearch,
  showNotification,
  showEmptyState,
  hideLoadingState,
  displayProcessInfo,
  extractSummaryRowsFromCapturedTable,
  setSummaryRows,
  setProcessCurrencyCode,
  setProcessMeta,
  setAccountOptions,
  setCurrencyOptions,
  setRoleOptions,
}) {
  const optionsQuery = useQuery({
    queryKey: ["dcs-summary-options", companyId ?? null],
    enabled: true,
    queryFn: async () => {
      const optionsUrl = companyId
        ? buildApiUrl(`api/datacapture_summary/summary_api.php?company_id=${encodeURIComponent(companyId)}`)
        : buildApiUrl("api/datacapture_summary/summary_api.php");
      const response = await fetch(optionsUrl, { credentials: "include" });
      const json = await response.json();
      if (!json?.success) {
        throw new Error(json?.message || "Failed to load summary options");
      }
      return json;
    },
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success") === "1";
    const error = url.searchParams.get("error") === "1";
    if (success) {
      showNotification("Success", "Data captured and summary generated successfully!", "success");
    } else if (error) {
      showNotification("Error", "Failed to generate summary. Please try again.", "error");
    }
    if (success || error) {
      url.searchParams.delete("success");
      url.searchParams.delete("error");
      window.history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""));
    }

    try {
      const tableDataRaw = localStorage.getItem("capturedTableData");
      const processDataRaw = localStorage.getItem("capturedProcessData");
      if (!tableDataRaw || !processDataRaw) {
        showEmptyState();
        return;
      }
      const tableData = JSON.parse(tableDataRaw);
      const processData = JSON.parse(processDataRaw);
      displayProcessInfo(processData);
      const initialRows = extractSummaryRowsFromCapturedTable(tableData);
      setSummaryRows(initialRows);
      const processId = Number(processData.process ?? processData.processId ?? processData.process_id ?? 0) || null;
      const processCurrencyText = String(processData.currencyName || processData.currency || "").trim();
      setProcessCurrencyCode(processCurrencyText);
      setProcessMeta({
        captureDate: processData.date || "",
        processId,
        currencyId: null,
        remark: processData.remark || "",
      });
      hideLoadingState();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("load summary react error:", e);
      showEmptyState();
    }
  }, [
    displayProcessInfo,
    extractSummaryRowsFromCapturedTable,
    hideLoadingState,
    locationSearch,
    setProcessCurrencyCode,
    setProcessMeta,
    setSummaryRows,
    showEmptyState,
    showNotification,
  ]);

  useEffect(() => {
    if (!optionsQuery.data) return;
    setAccountOptions(Array.isArray(optionsQuery.data.accounts) ? optionsQuery.data.accounts : []);
    setCurrencyOptions(Array.isArray(optionsQuery.data.currencies) ? optionsQuery.data.currencies : []);
    setRoleOptions(Array.isArray(optionsQuery.data.roles) ? optionsQuery.data.roles : []);
  }, [optionsQuery.data, setAccountOptions, setCurrencyOptions, setRoleOptions]);
}
