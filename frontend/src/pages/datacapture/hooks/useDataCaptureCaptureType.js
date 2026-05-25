import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  clearFormatPasteViewState,
  getFormatGridReady,
  gridHasEditableData,
  setFormatGridReady as setModuleFormatGridReady,
} from "../format/dataCaptureFormat.js";
import {
  isCitibetCaptureType,
  normalizeCaptureType,
  readInitialCaptureType,
} from "../lib/dataCaptureFormRules.js";

/**
 * Phase 2: Capture type switching + 2.Format view orchestration in React.
 * Legacy still owns paste parsing, grid fill, and iframe srcdoc rendering.
 */
export function useDataCaptureCaptureType() {
  const [captureType, setCaptureType] = useState(readInitialCaptureType);
  const [formatGridReady, setFormatGridReady] = useState(false);

  const captureTypeRef = useRef(captureType);
  captureTypeRef.current = captureType;

  const citibetMode = isCitibetCaptureType(captureType);

  const applyCaptureType = useCallback((nextType) => {
    const t = normalizeCaptureType(nextType) || "1.Text";
    const previous = captureTypeRef.current;
    const restoring = window.__DC_IS_RESTORING__ === true;

    setCaptureType(t);

    const container = document.querySelector(".excel-table-container");
    if (container) {
      if (isCitibetCaptureType(t)) container.classList.add("citibet-mode");
      else container.classList.remove("citibet-mode");
    }

    if (t === "2.Format") {
      if (!restoring && previous !== "2.Format") {
        clearFormatPasteViewState();
        window.__DC_CLEAR_GRID_CELLS__?.();
      } else if (gridHasEditableData() && getFormatGridReady()) {
        setModuleFormatGridReady(true);
      } else {
        clearFormatPasteViewState();
      }
    } else {
      setModuleFormatGridReady(false);
      if (previous === "2.Format") {
        window.__DC_CLEAR_FORMAT_STYLES__?.();
      }
    }

    window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
    window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
  }, []);

  const handleCaptureTypeChange = useCallback(
    (e) => {
      applyCaptureType(e.target.value);
    },
    [applyCaptureType],
  );

  const handlersRef = useRef({});
  handlersRef.current = { applyCaptureType };

  useLayoutEffect(() => {
    window.__DC_APPLY_CAPTURE_TYPE__ = (t) => handlersRef.current.applyCaptureType(t);
    window.__DC_GET_CAPTURE_TYPE__ = () => captureTypeRef.current;
    window.__DC_ON_FORMAT_GRID_READY__ = (ready) => setFormatGridReady(Boolean(ready));
    window.__DC_ON_CAPTURE_TYPE_APPLIED__ = (t) => {
      const s = normalizeCaptureType(t) || "1.Text";
      setCaptureType(s);
    };

    handlersRef.current.applyCaptureType(captureTypeRef.current);

    return () => {
      delete window.__DC_APPLY_CAPTURE_TYPE__;
      delete window.__DC_GET_CAPTURE_TYPE__;
      delete window.__DC_ON_FORMAT_GRID_READY__;
      delete window.__DC_ON_CAPTURE_TYPE_APPLIED__;
    };
  }, []);

  return {
    captureType,
    citibetMode,
    formatGridReady,
    applyCaptureType,
    handleCaptureTypeChange,
  };
}
