/**
 * Push a summary toast — uses React overlay when registered.
 */
export function pushSummaryNotification(title, message, type = "success") {
  if (typeof window.__SUMMARY_REACT_SHOW_NOTIFICATION__ === "function") {
    window.__SUMMARY_REACT_SHOW_NOTIFICATION__(title, message, type);
    return;
  }
  window.alert(message ? `${title}: ${message}` : title);
}

export function hideSummaryNotification() {
  window.__SUMMARY_REACT_HIDE_NOTIFICATION__?.();
}

export function showSummaryConfirmDelete(message, onConfirm) {
  if (typeof window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__ === "function") {
    window.__SUMMARY_REACT_SHOW_CONFIRM_DELETE__(message, onConfirm);
    return;
  }
  if (window.confirm(message)) {
    onConfirm?.();
  }
}
