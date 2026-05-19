export const FORMAT_PREVIEW_HTML_KEY = "capturedFormatPreviewHtml";
export const FORMAT_PREVIEW_HTML_KEY_LEGACY = "captured655PreviewHtml";

export function getFormatPreviewHtml() {
  try {
    return (
      localStorage.getItem(FORMAT_PREVIEW_HTML_KEY) ||
      localStorage.getItem(FORMAT_PREVIEW_HTML_KEY_LEGACY) ||
      ""
    );
  } catch {
    return "";
  }
}

export function setFormatPreviewHtml(html) {
  try {
    localStorage.setItem(FORMAT_PREVIEW_HTML_KEY, html ? String(html) : "");
  } catch {
    /* ignore */
  }
}

export function clearFormatPreviewHtml() {
  try {
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY);
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY_LEGACY);
  } catch {
    /* ignore */
  }
}
