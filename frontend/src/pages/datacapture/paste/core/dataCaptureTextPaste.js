import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { getClipboardHtml } from "./dataCaptureClipboard.js";
import { detectHtmlTableInClipboard } from "./dataCaptureClipboard.js";
import { parseAndFillHtmlTableForText } from "./dataCaptureTextHtmlPaste.js";

function getGridAnchorCell() {
  const tableBody = document.getElementById("tableBody");
  const firstRow = tableBody?.children?.[0];
  return firstRow?.children?.[1] || null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPasteAreaPreviewFromMatrix(area, dataMatrix) {
  if (!area || !dataMatrix?.length) return;
  let html = '<table border="1" cellspacing="0" cellpadding="4"><tbody>';
  dataMatrix.forEach((row) => {
    html += "<tr>";
    row.forEach((cell) => {
      html += `<td>${escapeHtml(cell)}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  area.innerHTML = html;
}

function afterTextPasteFilled(filled, area, previewMatrix) {
  if (!filled) return false;
  window.__DC_SET_FORMAT_GRID_READY__?.(true);
  if (area && previewMatrix?.length) {
    renderPasteAreaPreviewFromMatrix(area, previewMatrix);
  }
  window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
  return true;
}

/** 1.Text — fill hidden grid from TSV pasted into the text paste area. */
export function processTextPasteTsv(text, { area = null } = {}) {
  if (!text || !text.includes("\t")) return false;

  const anchorCell = getGridAnchorCell();
  if (!anchorCell) return false;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  if (!lines.length) return false;

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

  if (successCount <= 0) return false;

  notifyPasteSuccess(
    `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持Excel原始格式!`,
  );
  return afterTextPasteFilled(true, area, dataMatrix);
}

/** 1.Text — fill grid from HTML table pasted into the text paste area. */
export function processTextPasteHtml(html, { area = null } = {}) {
  if (!html || !html.includes("<table")) return false;
  const anchorCell = getGridAnchorCell();
  if (!anchorCell) return false;
  const filled = parseAndFillHtmlTableForText(html, anchorCell);
  if (!filled) return false;
  if (area) {
    try {
      const temp = document.createElement("div");
      temp.innerHTML = html;
      const table = temp.querySelector("table");
      if (table) area.innerHTML = table.outerHTML;
    } catch {
      /* keep grid data even if preview render fails */
    }
  }
  return afterTextPasteFilled(true, area);
}

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

/** 1.Text — HTML table paste (Phase 4b, React-owned). */
export function handleTextHtmlPaste(html, anchorCell) {
  if (!html || !html.includes("<table")) return false;
  return parseAndFillHtmlTableForText(html, anchorCell);
}

export function handleTextModePaste(e, pastedData, anchorCell) {
  const html = getClipboardHtml(e);
  if (handleTextHtmlPaste(html, anchorCell)) return true;

  const htmlFromDetect = detectHtmlTableInClipboard(e);
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;

  return handleTextTabPaste(e, pastedData, anchorCell);
}
