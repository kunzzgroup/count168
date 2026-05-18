import { useCallback, useLayoutEffect, useState } from "react";

const CAPTURE_OPTIONS = ["1.Text", "2.Format", "CITIBET", "CITIBET_MAJOR", "4.RETURN"];

function readInitialCaptureType() {
  const url = new URLSearchParams(window.location.search);
  const v = String(url.get("captureType") || url.get("dataCaptureType") || "").trim();
  return CAPTURE_OPTIONS.includes(v) ? v : "1.Text";
}

/**
 * Syncs visible Capture type & delete dialog with legacy `js/datacapture.js`.
 */
export function useDataCaptureLegacyChrome() {
  const [captureType, setCaptureType] = useState(readInitialCaptureType);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOption, setDeleteOption] = useState("shiftLeft");

  useLayoutEffect(() => {
    window.__DC_ON_CAPTURE_TYPE_APPLIED__ = (t) => {
      const s = String(t || "1.Text").trim() || "1.Text";
      setCaptureType(CAPTURE_OPTIONS.includes(s) ? s : "1.Text");
    };
    window.__DC_OPEN_DELETE_DIALOG__ = () => {
      setDeleteOption("shiftLeft");
      setDeleteOpen(true);
    };
    window.__DC_CLOSE_DELETE_DIALOG__ = () => setDeleteOpen(false);
    return () => {
      try {
        delete window.__DC_ON_CAPTURE_TYPE_APPLIED__;
        delete window.__DC_OPEN_DELETE_DIALOG__;
        delete window.__DC_CLOSE_DELETE_DIALOG__;
      } catch {
        window.__DC_ON_CAPTURE_TYPE_APPLIED__ = undefined;
        window.__DC_OPEN_DELETE_DIALOG__ = undefined;
        window.__DC_CLOSE_DELETE_DIALOG__ = undefined;
      }
    };
  }, []);

  const handleCaptureTypeChange = useCallback((e) => {
    const v = e.target.value;
    setCaptureType(v);
    if (typeof window.applyDataCaptureType === "function") {
      window.applyDataCaptureType(v);
    }
  }, []);

  const handleConfirmDelete = useCallback(() => {
    window.__DC_DELETE_DIALOG_OPTION__ = deleteOption;    try {
      if (typeof window.confirmDelete === "function") {
        window.confirmDelete();
      }
    } finally {
      try {
        delete window.__DC_DELETE_DIALOG_OPTION__;
      } catch {
        /* ignore */
      }
    }
  }, [deleteOption]);

  const closeDeleteDialog = useCallback(() => setDeleteOpen(false), []);

  return {
    captureType,
    handleCaptureTypeChange,
    deleteOpen,
    deleteOption,
    setDeleteOption,
    handleConfirmDelete,
    closeDeleteDialog,
  };
}
