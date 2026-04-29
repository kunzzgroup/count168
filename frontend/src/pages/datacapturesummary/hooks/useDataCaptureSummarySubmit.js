import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { buildApiUrl } from "../../../utils/apiUrl.js";

export function useDataCaptureSummarySubmit({
  processMeta,
  summaryRows,
  parseDisplayAmountToNumber,
  showNotification,
  navigate,
}) {
  const submitSummaryMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await fetch(buildApiUrl("api/datacapture_summary/summary_api.php?action=submit"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!json?.success) {
        throw new Error(json?.message || "Submit failed");
      }
      return json;
    },
  });

  const submitSummaryData = useCallback(() => {
    (async () => {
      try {
        if (!processMeta.captureDate || !processMeta.processId || !processMeta.currencyId) {
          showNotification("Error", "Missing process info for submit.", "error");
          return;
        }
        const summaryPayloadRows = summaryRows
          .filter((row) => !row.skipChecked)
          .filter((row) => row.accountId && row.idProduct)
          .map((row, idx) => ({
            idProductMain: row.idProduct,
            idProductSub: "",
            productType: "main",
            accountId: Number(row.accountId),
            currencyId: Number(row.currencyId || processMeta.currencyId),
            currencyCode: row.currency || "",
            formula: row.formula || "",
            sourcePercent: row.source || "1",
            processedAmount: parseDisplayAmountToNumber(row.processedAmount),
            rateValue: row.rateValue || null,
            displayOrder: idx,
          }));

        if (!summaryPayloadRows.length) {
          showNotification("Error", "No valid rows to submit.", "error");
          return;
        }

        await submitSummaryMutation.mutateAsync({
          captureDate: processMeta.captureDate,
          processId: Number(processMeta.processId),
          currencyId: Number(processMeta.currencyId),
          remark: processMeta.remark || "",
          summaryRows: summaryPayloadRows,
        });
        showNotification("Success", "Data submitted successfully.", "success");
        const url = new URL(window.location.href);
        url.searchParams.set("success", "1");
        navigate(url.pathname + url.search);
      } catch (error) {
        showNotification("Error", error?.message || "Submit failed", "error");
      }
    })();
  }, [navigate, parseDisplayAmountToNumber, processMeta.captureDate, processMeta.currencyId, processMeta.processId, processMeta.remark, showNotification, submitSummaryMutation, summaryRows]);

  return {
    submitSummaryData,
    isSubmitting: submitSummaryMutation.isPending,
  };
}
