/**
 * SPA page bootstrap — replaces legacy initDataCapturePage body for React form.
 */
import { pushDataCaptureNotification } from "./dataCaptureNotify.js";
import {
  shouldRestoreFromUrl,
  stripSearchParamsFromUrl,
} from "./dataCaptureStorage.js";
import { clearStaleFormatPreviewForFreshEntry } from "../format/dataCaptureFormat.js";
import { resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";
import { readInitialCaptureType } from "./dataCaptureFormRules.js";

function spaGridDimensions() {
  return resolveDataCaptureGridDimensions(window.__DC_IS_GROUP_ONLY_GRID__ === true);
}

export async function initDataCaptureSpaPage() {
  const dcFormGate = document.getElementById("dataCaptureForm");
  if (!dcFormGate) return;

  const urlParams = new URLSearchParams(window.location.search);
  const shouldRestore = shouldRestoreFromUrl();
  const alreadyInit = dcFormGate.dataset.dcPageInit === "1";

  clearStaleFormatPreviewForFreshEntry(shouldRestore);

  // One-time setup (grid shell, submitted list). Restore may re-run when SPA re-inits
  // after company metadata loads — do not gate the whole function on dcPageInit.
  if (!alreadyInit) {
    dcFormGate.dataset.dcPageInit = "1";

    if (!shouldRestore) {
      window.__DC_APPLY_CAPTURE_TYPE__?.(readInitialCaptureType());
      const { rows, cols } = spaGridDimensions();
      await window.__DC_ENSURE_GRID_READY__?.(rows, cols);
      await window.__DC_REFRESH_SUBMITTED_PROCESSES__?.();
    }

    if (urlParams.get("success") === "1") {
      pushDataCaptureNotification("Data captured successfully!", "success");
      stripSearchParamsFromUrl(["success"]);
    } else if (urlParams.get("error") === "1") {
      pushDataCaptureNotification("Failed to capture data. Please try again.", "danger");
      stripSearchParamsFromUrl(["error"]);
    } else if (urlParams.get("submitted") === "1") {
      pushDataCaptureNotification("Data captured successfully!", "success");
      if (window.__DC_IS_GROUP_ONLY_GRID__ === true) {
        await window.__DC_APPLY_GROUP_ONLY_PERSISTED_FORM__?.();
      }
      stripSearchParamsFromUrl(["submitted", "group_only"]);
    }
  }

  if (shouldRestore) {
    const { rows, cols } = spaGridDimensions();
    await window.__DC_ENSURE_GRID_READY__?.(rows, cols);
    await window.__DC_RESTORE_FROM_STORAGE__?.();
  }

  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}
