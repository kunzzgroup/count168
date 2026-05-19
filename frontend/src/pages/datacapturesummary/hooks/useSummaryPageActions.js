import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildSummaryRestoreCapturePath,
  buildSummarySubmittedCapturePath,
  clearSummarySessionAfterSubmit,
  runLegacyDeleteSelectedRows,
  runLegacyHideNotification,
  runLegacyRateBatchSubmit,
  runLegacyRateSelectAll,
  runLegacySubmitSummary,
  saveSummaryRefreshState,
} from "../summaryPageActions.js";

/**
 * Phase 4: React owns page chrome actions (Rate batch, Delete, Submit, Back, Refresh).
 * Payload building / formula recalc remain in legacy datacapturesummary.js.
 */
export function useSummaryPageActions({ companyId, scriptsReady }) {
  const navigate = useNavigate();
  const rateSelectAllRef = useRef(null);

  const [rateInput, setRateInput] = useState("");
  const [rateSelectAllLabel, setRateSelectAllLabel] = useState("Select All");
  const [deleteCount, setDeleteCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const navigateBack = useCallback(() => {
    saveSummaryRefreshState();
    window.isNavigatingAwayByBackOrSubmit = true;
    navigate(buildSummaryRestoreCapturePath(companyId), { replace: true });
  }, [navigate, companyId]);

  const navigateAfterSubmitSuccess = useCallback(() => {
    clearSummarySessionAfterSubmit();
    navigate(buildSummarySubmittedCapturePath(companyId), { replace: true });
  }, [navigate, companyId]);

  useLayoutEffect(() => {
    if (!scriptsReady) return undefined;

    window.__SUMMARY_REACT_NAV_BACK__ = navigateBack;
    window.__SUMMARY_REACT_REFRESH__ = () => {
      saveSummaryRefreshState();
      window.location.reload();
    };
    window.__SUMMARY_REACT_ON_DELETE_SELECTION_CHANGE__ = (count) => {
      setDeleteCount(Number(count) || 0);
    };
    window.__SUMMARY_REACT_ON_SUBMITTING_CHANGE__ = (value) => {
      setSubmitting(!!value);
    };
    window.__SUMMARY_REACT_ON_RATE_SELECT_ALL_LABEL__ = (label) => {
      if (typeof label === "string" && label.trim()) {
        setRateSelectAllLabel(label.trim());
      }
    };
    window.__SUMMARY_REACT_ON_SUBMIT_SUCCESS__ = navigateAfterSubmitSuccess;

    return () => {
      delete window.__SUMMARY_REACT_NAV_BACK__;
      delete window.__SUMMARY_REACT_REFRESH__;
      delete window.__SUMMARY_REACT_ON_DELETE_SELECTION_CHANGE__;
      delete window.__SUMMARY_REACT_ON_SUBMITTING_CHANGE__;
      delete window.__SUMMARY_REACT_ON_RATE_SELECT_ALL_LABEL__;
      delete window.__SUMMARY_REACT_ON_SUBMIT_SUCCESS__;
    };
  }, [scriptsReady, navigateBack, navigateAfterSubmitSuccess]);

  const handleBack = useCallback(() => {
    navigateBack();
  }, [navigateBack]);

  const handleRefresh = useCallback(() => {
    saveSummaryRefreshState();
    window.location.reload();
  }, []);

  const handleRateBatchSubmit = useCallback(() => {
    runLegacyRateBatchSubmit();
  }, []);

  const handleToggleRateSelectAll = useCallback(() => {
    const btn = rateSelectAllRef.current;
    if (!btn) return;
    runLegacyRateSelectAll(btn);
    if (window.__SUMMARY_REACT_TABLE__ && typeof window.__SUMMARY_REACT_ON_RATE_SELECT_ALL_LABEL__ === "function") {
      return;
    }
    setRateSelectAllLabel(btn.textContent.trim() || "Select All");
  }, []);

  const handleDeleteSelected = useCallback(() => {
    runLegacyDeleteSelectedRows();
  }, []);

  const handleSubmitSummary = useCallback(() => {
    runLegacySubmitSummary();
  }, []);

  return {
    rateInput,
    setRateInput,
    rateSelectAllLabel,
    rateSelectAllRef,
    deleteCount,
    deleteDisabled: deleteCount <= 0,
    submitting,
    handleBack,
    handleRefresh,
    handleRateBatchSubmit,
    handleToggleRateSelectAll,
    handleDeleteSelected,
    handleSubmitSummary,
    hideNotification: runLegacyHideNotification,
  };
}
