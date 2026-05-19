import { useLayoutEffect } from "react";
import { pushDataCaptureNotification } from "./dataCaptureNotify.js";

/**
 * Global shims so migrated paste/CRUD code works without js/datacapture.js.
 */
export function useDataCaptureGlobalShims() {
  useLayoutEffect(() => {
    window.showNotification = pushDataCaptureNotification;

    window.resetForm = () => {
      window.__DC_RESET__?.();
    };

    window.submitDataCaptureForm = () => {
      window.__DC_SUBMIT__?.();
    };

    return () => {
      if (window.showNotification === pushDataCaptureNotification) {
        delete window.showNotification;
      }
      if (window.resetForm) {
        delete window.resetForm;
      }
      if (window.submitDataCaptureForm) {
        delete window.submitDataCaptureForm;
      }
    };
  }, []);
}
