/**
 * SPA page bootstrap — replaces legacy initDataCapturePage body for React form.
 */
import { pushDataCaptureNotification } from "./dataCaptureNotify.js";
import {
  shouldRestoreFromUrl,
  stripSearchParamsFromUrl,
} from "./dataCaptureStorage.js";
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from "./dataCaptureGridConstants.js";
import { readInitialCaptureType } from "./dataCaptureTypeConstants.js";

export async function initDataCaptureSpaPage() {
  const dcFormGate = document.getElementById("dataCaptureForm");
  if (!dcFormGate || dcFormGate.dataset.dcPageInit === "1") return;
  dcFormGate.dataset.dcPageInit = "1";

  const urlParams = new URLSearchParams(window.location.search);
  const shouldRestore = shouldRestoreFromUrl();

  if (!shouldRestore) {
    window.__DC_APPLY_CAPTURE_TYPE__?.(readInitialCaptureType());
    await window.__DC_ENSURE_GRID_READY__?.(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);
    await window.__DC_REFRESH_SUBMITTED_PROCESSES__?.();
  }

  if (urlParams.get("success") === "1") {
    pushDataCaptureNotification("Data captured successfully!", "success");
    stripSearchParamsFromUrl(["success"]);
  } else if (urlParams.get("error") === "1") {
    pushDataCaptureNotification("Failed to capture data. Please try again.", "danger");
    stripSearchParamsFromUrl(["error"]);
  } else if (shouldRestore) {
    await window.__DC_RESTORE_FROM_STORAGE__?.();
    await window.__DC_ENSURE_GRID_READY__?.(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);
  }

  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}
