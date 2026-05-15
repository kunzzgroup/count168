import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { clearDataCaptureRoundLocalStorage } from "../../../utils/dataCaptureRoundStorage.js";

const MAX_ROWS_PER_BATCH = 20;

function buildSubmitUrl(companyId) {
  const base = buildApiUrl("api/datacapture_summary/summary_api.php?action=submit");
  return companyId ? `${base}&company_id=${encodeURIComponent(String(companyId))}` : base;
}

async function postSubmit(url, body, companyId) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      company_id: companyId ?? undefined,
    }),
  });
  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(responseText || "Invalid JSON from server");
  }
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || responseText || `HTTP ${response.status}`);
  }
  return json;
}

async function saveSubmissionRecord({ companyId, processId, captureDate }) {
  try {
    const formData = new FormData();
    formData.append("action", "save_submission");
    formData.append("process_id", String(processId));
    formData.append("date_submitted", captureDate);
    formData.append("capture_date", captureDate);
    if (companyId) formData.append("company_id", String(companyId));
    await fetch(buildApiUrl("api/processes/submitted_processes_api.php"), {
      method: "POST",
      body: formData,
      credentials: "include",
    });
  } catch {
    /* legacy JS logs only */
  }
}

export function useDataCaptureSummarySubmit({
  companyId,
  processMeta,
  summaryRows,
  parseDisplayAmountToNumber,
  showNotification,
  navigate,
}) {
  const submitSummaryMutation = useMutation({
    mutationFn: async ({ summaryPayloadRows }) => {
      const captureDate = processMeta.captureDate;
      const processId = processMeta.processId;
      const currencyId = processMeta.currencyId;
      if (!captureDate || !processId || !currencyId) {
        throw new Error("Missing process info for submit.");
      }

      const basePayload = {
        captureDate,
        processId: Number(processId),
        processName: processMeta.processName || "",
        currencyId: Number(currencyId),
        currencyName: processMeta.currencyName || processMeta.currencyCode || "",
        remark: processMeta.remark || "",
      };

      const url = buildSubmitUrl(companyId);

      const quickBody = {
        ...basePayload,
        summaryRows: summaryPayloadRows,
        immediateAck: 1,
      };
      try {
        const quickResult = await postSubmit(url, quickBody, companyId);
        if (quickResult?.queued) {
          return { mode: "queued", captureId: quickResult.captureId };
        }
      } catch {
        /* fall through to batched */
      }

      let captureId = null;
      const batchSize = Math.max(1, Math.min(MAX_ROWS_PER_BATCH, summaryPayloadRows.length));
      for (let i = 0; i < summaryPayloadRows.length; i += batchSize) {
        const batchRows = summaryPayloadRows.slice(i, i + batchSize);
        const batchBody = {
          ...basePayload,
          summaryRows: batchRows,
          ...(captureId ? { captureId } : {}),
        };
        const result = await postSubmit(url, batchBody, companyId);
        if (result?.captureId) captureId = result.captureId;
        if (i + batchSize < summaryPayloadRows.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      return { mode: "sync", captureId };
    },
  });

  const submitSummaryData = useCallback(() => {
    if (submitSummaryMutation.isPending) return;
    (async () => {
      try {
        if (!processMeta.captureDate || !processMeta.processId || !processMeta.currencyId) {
          showNotification("Error", "Missing process info for submit.", "error");
          return;
        }

        const summaryPayloadRows = summaryRows
          .filter((row) => !row.skipChecked)
          .filter((row) => row.accountId && row.idProduct)
          .map((row, idx) => {
            const isSub = row.productType === "sub";
            const idMain = isSub ? String(row.parentIdProduct || "").trim() : String(row.idProduct || "").trim();
            const idSub = isSub ? String(row.idProduct || "").trim() : "";
            return {
              idProductMain: idMain,
              idProductSub: idSub,
              productType: isSub ? "sub" : "main",
              ...(isSub && row.parentIdProduct ? { parentIdProduct: String(row.parentIdProduct).trim() } : {}),
              accountId: Number(row.accountId),
              currencyId: Number(row.currencyId || processMeta.currencyId),
              currencyCode: row.currency || "",
              formula: row.formula || "",
              sourcePercent: row.source || "1",
              processedAmount: parseDisplayAmountToNumber(row.processedAmount),
              rateValue: row.rateValue || null,
              displayOrder: idx,
            };
          });

        if (!summaryPayloadRows.length) {
          showNotification("Error", "No valid rows to submit.", "error");
          return;
        }

        window.dispatchEvent(new CustomEvent("datacapture-summary-submit-start"));

        const result = await submitSummaryMutation.mutateAsync({ summaryPayloadRows });

        if (result?.mode === "queued") {
          showNotification("Success", "Data received by server. Processing in background...", "success");
        } else {
          showNotification("Success", "Data submitted successfully.", "success");
          await saveSubmissionRecord({
            companyId,
            processId: processMeta.processId,
            captureDate: processMeta.captureDate,
          });
        }

        clearDataCaptureRoundLocalStorage();

        const delayMs = result?.mode === "queued" ? 600 : 1500;
        setTimeout(() => {
          navigate("/datacapture?submitted=1");
        }, delayMs);
      } catch (error) {
        showNotification("Error", error?.message || "Submit failed", "error");
      }
    })();
  }, [
    companyId,
    navigate,
    parseDisplayAmountToNumber,
    processMeta.captureDate,
    processMeta.currencyId,
    processMeta.currencyName,
    processMeta.currencyCode,
    processMeta.processId,
    processMeta.processName,
    processMeta.remark,
    submitSummaryMutation,
    summaryRows,
  ]);

  return {
    submitSummaryData,
    isSubmitting: submitSummaryMutation.isPending,
  };
}
