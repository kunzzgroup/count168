/** Bottom-left "Typing" badge while a grid cell is in edit mode. */

export function showGridTypingStatus() {
  const el = document.getElementById("dcGridTypingStatus");
  if (!el) return;
  const dataTable = document.getElementById("dataTable");
  if (!dataTable || dataTable.style.display === "none") {
    el.hidden = true;
    return;
  }
  el.hidden = false;
}

export function hideGridTypingStatus() {
  const el = document.getElementById("dcGridTypingStatus");
  if (el) el.hidden = true;
}

export function syncGridTypingStatus() {
  const active = document.activeElement;
  if (active?.contentEditable === "true" && active.closest("#dataTable")) {
    showGridTypingStatus();
  } else {
    hideGridTypingStatus();
  }
}
