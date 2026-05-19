/** Read clipboard payloads from a paste event. */

export function resolvePasteCell(target) {
  if (!target) return null;
  return target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
}

export function isTypingModeCell(cell) {
  return Boolean(cell && document.activeElement === cell);
}

export function getClipboardPlainText(e) {
  const clipboard = e.clipboardData || window.clipboardData;
  const getData = (type) => {
    try {
      if (!clipboard || typeof clipboard.getData !== "function") return "";
      return clipboard.getData(type) || "";
    } catch {
      return "";
    }
  };
  return getData("text/plain") || getData("text") || getData("Text") || "";
}

export function getClipboardHtml(e) {
  try {
    return e.clipboardData?.getData("text/html") || "";
  } catch {
    return "";
  }
}
