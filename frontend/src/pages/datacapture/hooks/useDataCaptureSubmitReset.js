import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  loadCaptureSession,
  saveCaptureSession,
  shouldRestoreFromUrl,
  stripRestoreParamFromUrl,
} from "../lib/dataCaptureStorage.js";
import { captureTableDataFromDom } from "../lib/dataCaptureTableSnapshot.js";
import {
  getActiveDescriptions,
  validateDataCaptureForm,
} from "../lib/dataCaptureFormRules.js";
import { fetchProcessDetail } from "../lib/dataCaptureApi.js";
import { convertTableFormatOnSubmit } from "../lib/dataCaptureConvertTableOnSubmit.js";
import { buildSpaPath } from "../../../utils/core/apiUrl.js";
import { pushDataCaptureNotification } from "../lib/dataCaptureNotify.js";
import { translateDataCaptureMessage } from "../../../translateFile/pages/dataCaptureTranslate.js";
import { markSummaryFreshNavigation } from "../../datacapturesummary/lib/summaryStorage.js";

function readSubmitFormSnapshot(formRef) {
  const f = formRef.current;
  const currencyId = f.currencyId || document.getElementById("capture_currency")?.value || "";
  const descriptionDisplay =
    f.descriptionDisplay || document.getElementById("capture_description")?.value || "";

  let selectedProcess = f.selectedProcess;
  if (!selectedProcess?.id) {
    const processBtn = document.getElementById("capture_process");
    const processId = processBtn?.getAttribute("data-value") || "";
    if (processId) {
      selectedProcess = {
        id: processId,
        displayText: processBtn.textContent?.trim() || "",
        process_id: processBtn.getAttribute("data-process-code") || "",
        description_name: processBtn.getAttribute("data-description-name") || null,
      };
    }
  }

  let descriptions = Array.isArray(window.selectedDescriptions) ? window.selectedDescriptions : [];
  if (!descriptions.length && descriptionDisplay) {
    descriptions = getActiveDescriptions(descriptionDisplay);
    if (descriptions.length) {
      window.selectedDescriptions = [...descriptions];
    }
  }

  return { selectedProcess, currencyId, descriptionDisplay, descriptions };
}

function buildProcessCapturePayload(form, captureType, currencies) {
  const currencyOpt = (currencies || []).find((c) => String(c.id) === String(form.currencyId));
  return {
    date: form.captureDate,
    process: form.selectedProcess?.id,
    processName: form.selectedProcess?.displayText || "",
    processCode: form.selectedProcess?.process_id || "",
    dataCaptureType: captureType,
    descriptions: getActiveDescriptions(form.descriptionDisplay),
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
 * Submit-time table transform lives in dataCaptureConvertTableOnSubmit.js (Phase 5b).
 */
export function useDataCaptureSubmitReset({
  companyId,
  form,
  captureType,
  mutationsBlocked = false,
  navigate,
  t,
}) {
  const [submitDisabled, setSubmitDisabled] = useState(true);
  const [submitBlockReason, setSubmitBlockReason] = useState("");
  const restoreInFlightRef = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;
  const captureTypeRef = useRef(captureType);
  captureTypeRef.current = captureType;

  const recomputeSubmitState = useCallback(() => {
    const captureTypeNow =
      (typeof window.__DC_GET_CAPTURE_TYPE__ === "function"
        ? window.__DC_GET_CAPTURE_TYPE__()
        : captureTypeRef.current) || captureTypeRef.current;
    const { selectedProcess, currencyId, descriptionDisplay, descriptions } = readSubmitFormSnapshot(formRef);
    const tableData = captureTableDataFromDom(captureTypeNow);
    const validation = validateDataCaptureForm({
      selectedProcess,
      descriptions,
      descriptionDisplay,
      currencyId,
      captureType: captureTypeNow,
      tableData,
    });
    setSubmitDisabled(!validation.ok);
    setSubmitBlockReason(validation.ok ? "" : validation.message || "");
  }, []);

  useEffect(() => {
    recomputeSubmitState();
  }, [
    recomputeSubmitState,
    form.selectedProcess,
    form.currencyId,
    form.descriptionDisplay,
    captureType,
  ]);

  useEffect(() => {
    let observer;
    let pollId;
    let debounceId;

    const schedule = () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(() => recomputeSubmitState(), 80);
    };

    const attach = () => {
      const tableBody = document.getElementById("tableBody");
      if (!tableBody) return false;
      tableBody.addEventListener("input", schedule, true);
      observer = new MutationObserver(schedule);
      observer.observe(tableBody, { childList: true, subtree: true, characterData: true });
      schedule();
      return true;
    };

    if (!attach()) {
      pollId = setInterval(() => {
        if (attach()) clearInterval(pollId);
      }, 250);
    }

    return () => {
      clearInterval(pollId);
      clearTimeout(debounceId);
      const tableBody = document.getElementById("tableBody");
      if (tableBody) tableBody.removeEventListener("input", schedule, true);
      observer?.disconnect();
    };
  }, [recomputeSubmitState]);

  const submit = useCallback(async () => {
    if (mutationsBlocked) {
      pushDataCaptureNotification(t("readOnlyBlocked"), "danger");
      return;
    }
    const captureTypeNow = captureTypeRef.current;
    const { selectedProcess, currencyId, descriptionDisplay, descriptions } = readSubmitFormSnapshot(formRef);
    const tableData = captureTableDataFromDom(captureTypeNow);
    const validation = validateDataCaptureForm({
      selectedProcess,
      descriptions,
      descriptionDisplay,
      currencyId,
      captureType: captureTypeNow,
      tableData,
    });
    if (!validation.ok) {
      pushDataCaptureNotification(translateDataCaptureMessage(localStorage.getItem("login_lang") === "zh" ? "zh" : "en", validation.message), "danger");
      return;
    }

    convertTableFormatOnSubmit(captureTypeNow);

    try {
      const processData = buildProcessCapturePayload(formRef.current, captureTypeNow, formRef.current.currencies);
      const finalTableData = captureTableDataFromDom(captureTypeNow);
      saveCaptureSession(finalTableData, processData, captureTypeNow);

      markSummaryFreshNavigation();
      if (typeof navigate === "function") {
        navigate("/datacapturesummary?success=1");
        return;
      }
      window.location.assign(buildSpaPath("datacapturesummary?success=1"));
    } catch (error) {
      console.error("Error submitting data:", error);
      pushDataCaptureNotification(t("failedCaptureData"), "danger");
    }
  }, [mutationsBlocked, navigate, t]);

  const reset = useCallback(() => {
    if (typeof window.__DC_REACT_FORM_RESET__ === "function") {
      window.__DC_REACT_FORM_RESET__();
    }
    window.selectedDescriptions = [];

    if (typeof window.__DC_CLEAR_CAPTURE_TABLE__ === "function") {
      window.__DC_CLEAR_CAPTURE_TABLE__();
    }

    if (typeof window.__DC_APPLY_CAPTURE_TYPE__ === "function") {
      window.__DC_APPLY_CAPTURE_TYPE__("1.Text");
    } else if (typeof window.applyDataCaptureType === "function") {
      window.applyDataCaptureType("1.Text");
    }

    recomputeSubmitState();
  }, [recomputeSubmitState]);

  const restoreFromStorage = useCallback(async () => {
    if (!shouldRestoreFromUrl()) return;
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;

    const session = loadCaptureSession();
    if (!session) {
      restoreInFlightRef.current = false;
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
      restoreInFlightRef.current = false;
      window.__DC_IS_RESTORING__ = false;
      recomputeSubmitState();
    }
  }, [companyId, recomputeSubmitState]);

  const handlersRef = useRef({});
  handlersRef.current = { submit, reset, restoreFromStorage, recomputeSubmitState };

  useLayoutEffect(() => {
    const runConvert = () => convertTableFormatOnSubmit(captureTypeRef.current);
    window.__DC_CONVERT_TABLE_ON_SUBMIT__ = runConvert;
    window.__DC_CONVERT_TABLE_ON_SUBMIT_REACT__ = runConvert;
    window.__DC_RECOMPUTE_SUBMIT_STATE__ = () => handlersRef.current.recomputeSubmitState();
    window.__DC_SUBMIT__ = () => handlersRef.current.submit();
    window.__DC_RESET__ = () => handlersRef.current.reset();
    window.__DC_RESTORE_FROM_STORAGE__ = () => handlersRef.current.restoreFromStorage();
    window.updateSubmitButtonState = window.__DC_RECOMPUTE_SUBMIT_STATE__;

    return () => {
      const recompute = window.__DC_RECOMPUTE_SUBMIT_STATE__;
      delete window.__DC_CONVERT_TABLE_ON_SUBMIT__;
      delete window.__DC_CONVERT_TABLE_ON_SUBMIT_REACT__;
      delete window.__DC_RECOMPUTE_SUBMIT_STATE__;
      delete window.__DC_SUBMIT__;
      delete window.__DC_RESET__;
      delete window.__DC_RESTORE_FROM_STORAGE__;
      if (window.updateSubmitButtonState === recompute) {
        delete window.updateSubmitButtonState;
      }
    };
  }, []);

  return {
    submitDisabled,
    submitBlockReason,
    submit,
    reset,
    restoreFromStorage,
    recomputeSubmitState,
  };
}
