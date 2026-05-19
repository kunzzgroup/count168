/**
 * React-owned delete entry: opens confirm modal then runs legacy executeDeleteSelectedRows.
 */
import { pushSummaryNotification, showSummaryConfirmDelete } from "./summaryNotify.js";

function notifyError(title, message, showNotification) {
  if (typeof showNotification === "function") {
    showNotification(title, message, "error");
    return;
  }
  pushSummaryNotification(title, message, "error");
}

function openConfirmDelete(message, onConfirm, showConfirmDelete) {
  if (typeof showConfirmDelete === "function") {
    showConfirmDelete(message, onConfirm);
    return;
  }
  if (typeof window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__ === "function") {
    window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__(message, onConfirm);
    return;
  }
  showSummaryConfirmDelete(message, onConfirm);
}

export function requestSummaryDeleteConfirmation({ showConfirmDelete, showNotification }) {
  const collect = window.collectValidDeleteRowTargets;
  const execute = window.executeDeleteSelectedRows;

  if (typeof collect !== "function" || typeof execute !== "function") {
    notifyError(
      "Error",
      "Delete is not ready yet. Please wait for the page to finish loading.",
      showNotification
    );
    return;
  }

  const valid = collect();
  if (!valid.length) {
    notifyError(
      "Error",
      "Please select valid rows to delete. Empty sub rows cannot be deleted.",
      showNotification
    );
    return;
  }

  const message = `Are you sure you want to delete ${valid.length} selected row(s)? This action cannot be undone.`;

  openConfirmDelete(message, () => execute(valid), showConfirmDelete);
}
