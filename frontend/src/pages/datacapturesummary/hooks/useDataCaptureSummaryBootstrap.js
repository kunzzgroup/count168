import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { computeProcessedAmounts } from "../utils/summaryNumberUtils.js";
import { applyMaintenanceTemplates } from "../utils/applySummaryTemplates.js";
import { mergeSummaryRowsFromServerState } from "../utils/mergeSummaryServerState.js";

function hydrateRowLabels(row, accountOptions, currencyOptions) {
  let account = row.account;
  if (row.accountId && Array.isArray(accountOptions) && accountOptions.length) {
    const acc = accountOptions.find((a) => Number(a.id) === Number(row.accountId));
    if (acc) account = acc.name ? `${acc.account_id} (${acc.name})` : acc.account_id;
  }
  let currency = row.currency;
  if (row.currencyId && Array.isArray(currencyOptions) && currencyOptions.length) {
    const cur = currencyOptions.find((c) => Number(c.id) === Number(row.currencyId));
    if (cur) currency = cur.code;
  }
  return {
    ...row,
    account,
    currency,
    ...computeProcessedAmounts(row.formula || "", row.source || "1", row.rateValue || ""),
  };
}

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
    } catch {
      showEmptyState();
      return;
    }
  }, [locationSearch, showEmptyState, showNotification]);

  useEffect(() => {
    if (optionsQuery.isError) {
      showEmptyState();
    }
  }, [optionsQuery.isError, showEmptyState]);

  useEffect(() => {
    if (!optionsQuery.isSuccess || !optionsQuery.data) return;

    let tableDataRaw;
    let processDataRaw;
    try {
      tableDataRaw = localStorage.getItem("capturedTableData");
      processDataRaw = localStorage.getItem("capturedProcessData");
      if (!tableDataRaw || !processDataRaw) {
        return;
      }
    } catch {
      showEmptyState();
      return;
    }

    let cancelled = false;

    (async () => {
      const accounts = Array.isArray(optionsQuery.data.accounts) ? optionsQuery.data.accounts : [];
      const currencies = Array.isArray(optionsQuery.data.currencies) ? optionsQuery.data.currencies : [];
      const roles = Array.isArray(optionsQuery.data.roles) ? optionsQuery.data.roles : [];

      setAccountOptions(accounts);
      setCurrencyOptions(currencies);
      setRoleOptions(roles);

      let tableData;
      let processData;
      try {
        tableData = JSON.parse(tableDataRaw);
        processData = JSON.parse(processDataRaw);
      } catch {
        if (!cancelled) showEmptyState();
        return;
      }

      displayProcessInfo(processData);

      const processId = Number(processData.process ?? processData.processId ?? processData.process_id ?? 0) || null;
      const processCurrencyText = String(processData.currencyName || processData.currency || "").trim();
      const processCode = String(processData.processCode ?? "").trim();
      const processName = String(processData.processName ?? processData.process ?? "").trim();

      setProcessCurrencyCode(processCurrencyText);
      setProcessMeta({
        captureDate: processData.date || "",
        processId,
        currencyId: null,
        remark: processData.remark || "",
        processName,
        processCode,
        currencyName: processCurrencyText,
      });

      let rows = extractSummaryRowsFromCapturedTable(tableData);

      const uniqueIds = [...new Set(rows.map((r) => String(r.idProduct || "").trim()).filter(Boolean))];

      let captureIdTpl = null;
      try {
        const st = localStorage.getItem("capturedCaptureId");
        if (st != null && st !== "") captureIdTpl = parseInt(st, 10);
      } catch {
        /* ignore */
      }

      const tplBase = buildApiUrl("api/datacapture_summary/summary_api.php?action=templates");
      const tplUrl = companyId ? `${tplBase}&company_id=${encodeURIComponent(String(companyId))}` : tplBase;

      let templates = {};
      if (uniqueIds.length && processId) {
        try {
          const tres = await fetch(tplUrl, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idProducts: uniqueIds,
              processId,
              company_id: companyId ?? undefined,
              ...(captureIdTpl != null && !Number.isNaN(captureIdTpl) && captureIdTpl > 0 ? { captureId: captureIdTpl } : {}),
            }),
          });
          const tjson = await tres.json();
          if (tjson?.success && tjson.templates && typeof tjson.templates === "object") {
            templates = tjson.templates;
          }
        } catch {
          /* templates optional */
        }
      }

      rows = applyMaintenanceTemplates(rows, templates, tableData, accounts, currencies);

      if (processId) {
        try {
          const stParams = new URLSearchParams({ action: "get_summary_state", process_id: String(processId) });
          if (processCode) stParams.set("process_code", processCode);
          const stUrl = buildApiUrl(`api/datacapture_summary/summary_api.php?${stParams.toString()}`);
          const stRes = await fetch(stUrl, { credentials: "include" });
          const stJson = await stRes.json();
          if (stJson?.success && stJson.data && typeof stJson.data === "object") {
            rows = mergeSummaryRowsFromServerState(rows, stJson.data);
          }
        } catch {
          /* ignore */
        }
      }

      rows = rows.map((r) => hydrateRowLabels(r, accounts, currencies));

      if (cancelled) return;
      setSummaryRows(rows);
      hideLoadingState();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    displayProcessInfo,
    extractSummaryRowsFromCapturedTable,
    hideLoadingState,
    optionsQuery.data,
    optionsQuery.isSuccess,
    setAccountOptions,
    setCurrencyOptions,
    setProcessCurrencyCode,
    setProcessMeta,
    setRoleOptions,
    setSummaryRows,
    showEmptyState,
  ]);
}
