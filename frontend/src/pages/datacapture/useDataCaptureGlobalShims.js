import { useLayoutEffect } from "react";
import { unsetWindowProperty } from "../../utils/unsetWindowProperty.js";
import { pushDataCaptureNotification } from "./dataCaptureNotify.js";

/**
 * Global shims so migrated paste/CRUD code works without js/datacapture.js.
 */
export function useDataCaptureGlobalShims() {
  useLayoutEffect(() => {
    const resetForm = () => {
      window.__DC_RESET__?.();
    };

    const submitDataCaptureForm = () => {
      window.__DC_SUBMIT__?.();
    };

    window.showNotification = pushDataCaptureNotification;
    window.resetForm = resetForm;
    window.submitDataCaptureForm = submitDataCaptureForm;

    return () => {
      unsetWindowProperty("showNotification", pushDataCaptureNotification);
      unsetWindowProperty("resetForm", resetForm);
      unsetWindowProperty("submitDataCaptureForm", submitDataCaptureForm);
    };
  }, []);
}
