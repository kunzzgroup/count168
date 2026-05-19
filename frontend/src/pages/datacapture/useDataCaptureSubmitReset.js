import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { pushDataCaptureNotification } from "./dataCaptureNotify.js";
import {
  loadCaptureSession,
  saveCaptureSession,
  shouldRestoreFromUrl,
  stripRestoreParamFromUrl,
} from "./dataCaptureStorage.js";
import { captureTableDataFromDom } from "./dataCaptureTableSnapshot.js";
import { isSubmitReady, validateDataCaptureForm } from "./dataCaptureValidation.js";
import { fetchProcessDetail } from "./dataCaptureApi.js";

function buildProcessCapturePayload(form, captureType, currencies) {
  const currencyOpt = (currencies || []).find((c) => String(c.id) === String(form.currencyId));
  return {
    date: form.captureDate,
    process: form.selectedProcess?.id,
    processName: form.selectedProcess?.displayText || "",
    processCode: form.selectedProcess?.process_id || "",
    dataCaptureType: captureType,
    descriptions: Array.isArray(window.selectedDescriptions) ? [...window.selectedDescriptions] : [],
    currency: form.currencyId,
    currencyName: currencyOpt?.code || "",
    removeWord: form.removeWord || "",
    replaceWordFrom: form.replaceFrom || "",
    replaceWordTo: form.replaceTo || "",
    remark: form.remark || "",
  };
}

/**
 * Phase 1 migration: Submit, Reset, and Restore orchestration in React.
 * Table DOM mutations still delegate to legacy helpers until phase 3.
 */
export function useDataCaptureSubmitReset({ companyId, form, captureType }) {
  const [submitDisabled, setSubmitDisabled] = useState(true);
  const restoreStartedRef = useRef(false);

  const recomputeSubmitState = useCallback(() => {
    const tableData = captureTableDataFromDom(captureType);
    const ready = isSubmitReady({
      selectedProcess: form.selectedProcess,
      descriptions: window.selectedDescriptions || [],
      currencyId: form.currencyId,
      captureType,
      tableData,
    });
    setSubmitDisabled(!ready);
  }, [form.selectedProcess, form.currencyId, form.descriptionDisplay, captureType]);

  useEffect(() => {
    recomputeSubmitState();
  }, [recomputeSubmitState]);

  const submit = useCallback(async () => {
    const tableData = captureTableDataFromDom(captureType);
    const validation = validateDataCaptureForm({
      selectedProcess: form.selectedProcess,
      descriptions: window.selectedDescriptions || [],
      currencyId: form.currencyId,
      captureType,
      tableData,
    });
    if (!validation.ok) {
      pushDataCaptureNotification(validation.message, "danger");
      return;
    }

    if (typeof window.__DC_CONVERT_TABLE_ON_SUBMIT__ === "function") {
      window.__DC_CONVERT_TABLE_ON_SUBMIT__();
    }

    try {
      const processData = buildProcessCapturePayload(form, captureType, form.currencies);
      const finalTableData = captureTableDataFromDom(captureType);
      saveCaptureSession(finalTableData, processData, captureType);

      pushDataCaptureNotification("Data captured successfully! Redirecting to summary...", "success");
      window.isNavigatingAwayByBackOrSubmit = true;
      setTimeout(() => {
        window.location.assign(buildApiUrl("datacapturesummary?success=1"));
      }, 1500);
    } catch (error) {
      console.error("Error submitting data:", error);
      pushDataCaptureNotification("Failed to capture data", "danger");
    }
  }, [form, captureType]);

  const reset = useCallback(() => {
    if (typeof window.__DC_REACT_FORM_RESET__ === "function") {
      window.__DC_REACT_FORM_RESET__();
    }
    window.selectedDescriptions = [];

    if (typeof window.__DC_CLEAR_CAPTURE_TABLE__ === "function") {
      window.__DC_CLEAR_CAPTURE_TABLE__();
    }

    if (typeof window.applyDataCaptureType === "function") {
      window.applyDataCaptureType("1.Text");
    }

    recomputeSubmitState();
  }, [recomputeSubmitState]);

  const restoreFromStorage = useCallback(async () => {
    if (!shouldRestoreFromUrl()) return;
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    const session = loadCaptureSession();
    if (!session) {
      window.__DC_IS_RESTORING__ = false;
      stripRestoreParamFromUrl();
      return;
    }

    window.__DC_IS_RESTORING__ = true;
    const { tableData, processData, captureType: savedType } = session;

    try {
      if (typeof window.__DC_POST_LEGACY_RESTORE_SYNC__ === "function") {
        await window.__DC_POST_LEGACY_RESTORE_SYNC__(processData);
      }

      if (typeof window.__DC_RELOAD_PROCESSES__ === "function") {
        await window.__DC_RELOAD_PROCESSES__();
      }
      if (typeof window.__DC_REFRESH_SUBMITTED_PROCESSES__ === "function") {
        await window.__DC_REFRESH_SUBMITTED_PROCESSES__();
      }

      await new Promise((r) => setTimeout(r, 300));

      if (typeof window.__DC_POST_LEGACY_RESTORE_SYNC__ === "function") {
        await window.__DC_POST_LEGACY_RESTORE_SYNC__(processData);
      }

      const pid = processData.process != null ? String(processData.process) : "";
      if (pid && companyId) {
        const res = await fetchProcessDetail(pid, companyId);
        if (res.success && res.data && typeof window.__DC_POST_LEGACY_RESTORE_SYNC__ === "function") {
          await window.__DC_POST_LEGACY_RESTORE_SYNC__({
            ...processData,
            currency: processData.currency || res.data.currency_id,
          });
        }
      }

      if (typeof window.__DC_RESTORE_CAPTURE_TABLE__ === "function") {
        await window.__DC_RESTORE_CAPTURE_TABLE__(tableData, savedType);
      } else if (typeof window.applyDataCaptureType === "function") {
        window.applyDataCaptureType(savedType);
      }

      if (typeof window.__DC_POST_LEGACY_RESTORE_SYNC__ === "function") {
        await window.__DC_POST_LEGACY_RESTORE_SYNC__(processData);
      }

      stripRestoreParamFromUrl();
    } catch (err) {
      console.error("React restore failed:", err);
    } finally {
      window.__DC_IS_RESTORING__ = false;
      recomputeSubmitState();
    }
  }, [companyId, recomputeSubmitState]);

  const handlersRef = useRef({});
  handlersRef.current = { submit, reset, restoreFromStorage, recomputeSubmitState };

  useLayoutEffect(() => {
    window.__DC_SUBMIT__ = () => handlersRef.current.submit();
    window.__DC_RESET__ = () => handlersRef.current.reset();
    window.__DC_RESTORE_FROM_STORAGE__ = () => handlersRef.current.restoreFromStorage();
    window.updateSubmitButtonState = () => handlersRef.current.recomputeSubmitState();

    return () => {
      delete window.__DC_SUBMIT__;
      delete window.__DC_RESET__;
      delete window.__DC_RESTORE_FROM_STORAGE__;
      if (window.updateSubmitButtonState) {
        delete window.updateSubmitButtonState;
      }
    };
  }, []);

  return {
    submitDisabled,
    submit,
    reset,
    restoreFromStorage,
    recomputeSubmitState,
  };
}
