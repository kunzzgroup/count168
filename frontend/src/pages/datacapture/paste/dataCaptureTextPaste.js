import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { getClipboardHtml } from "./dataCaptureClipboard.js";

/** 1.Text — tab-separated Excel paste (always from column 0). */
export function handleTextTabPaste(e, pastedData, anchorCell) {
  const normalized = pastedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  if (!lines.length || !lines.some((line) => line.includes("\t"))) return false;

  const dataMatrix = [];
  let maxCols = 0;

  lines.forEach((line) => {
    if (line.includes("\t")) {
      const cells = line.split("\t");
      dataMatrix.push(cells);
      maxCols = Math.max(maxCols, cells.length);
    } else {
      dataMatrix.push([line]);
      maxCols = Math.max(maxCols, 1);
    }
  });

  dataMatrix.forEach((row) => {
    while (row.length < maxCols) row.push("");
  });

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    startColOverride: 0,
    uppercaseValues: false,
    trimValues: false,
  });

  if (successCount > 0) {
    notifyPasteSuccess(
      `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持Excel原始格式!`,
    );
    return true;
  }
  return false;
}

/** 1.Text — delegate HTML table paste to legacy until phase 4b. */
export function handleTextHtmlPaste(html, anchorCell) {
  if (!html || !html.includes("<table")) return false;

  if (typeof window.__DC_LEGACY_PARSE_HTML_TEXT__ === "function") {
    return window.__DC_LEGACY_PARSE_HTML_TEXT__(html, anchorCell);
  }
  if (typeof window.parseAndFillHTMLTableForText === "function") {
    return window.parseAndFillHTMLTableForText(html, anchorCell);
  }
  return false;
}

export function handleTextModePaste(e, pastedData, anchorCell) {
  const html = getClipboardHtml(e);
  if (handleTextHtmlPaste(html, anchorCell)) return true;

  const htmlFromDetect =
    typeof window.__DC_LEGACY_DETECT_HTML__ === "function"
      ? window.__DC_LEGACY_DETECT_HTML__(e)
      : typeof window.detectAndParseHTML === "function"
        ? window.detectAndParseHTML(e)
        : null;
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;

  return handleTextTabPaste(e, pastedData, anchorCell);
}
