import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import {
  detectHtmlTableInClipboard,
  getClipboardHtml,
} from "./dataCaptureClipboard.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
import {
  parseAndFillHtmlTableForText,
  parseAndFillHtmlTableForTextWithFormat,
} from "./dataCaptureTextHtmlPaste.js";
import { sanitizePasteMatrix } from "./dataCapturePasteMatrixSanitize.js";
import {
  detectFlattenedStatementMatrix,
  detectVerticalFieldDump,
} from "./dataCaptureVerticalDumpDetect.js";

/** Exported for Citibet-style statement matrix paste (1.Text / 2.Format). */
export function parsePlainTextMatrix(pastedData) {
  const normalized = pastedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) return [];

  if (normalized.includes("\t")) {
    const tabRows = normalized
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (!tabRows.length) return [];

    const maxCols = Math.max(...tabRows.map((row) => row.length));
    tabRows.forEach((row) => {
      while (row.length < maxCols) row.push("");
    });
    return sanitizePasteMatrix(tabRows);
  }

  const rawLines = normalized.split("\n");
  const hasBlankLine = rawLines.some((line) => line.trim() === "");
  if (hasBlankLine) {
    const rowBlocks = [];
    let currentRow = [];

    rawLines.forEach((line) => {
      if (line.trim() === "") {
        if (currentRow.length) {
          rowBlocks.push(currentRow);
          currentRow = [];
        }
        return;
      }
      currentRow.push(line);
    });
    if (currentRow.length) rowBlocks.push(currentRow);

    const hasMultiColBlock = rowBlocks.some((row) => row.length > 1);
    if (rowBlocks.length >= 2 && hasMultiColBlock) {
      const maxCols = Math.max(...rowBlocks.map((row) => row.length));
      rowBlocks.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return rowBlocks;
    }
  }

  const nonEmptyLines = rawLines.filter((line) => line.trim() !== "");

  // Material mat-row copy (any row count, no tabs) — run before statement/heuristics.
  const verticalDumpRows = detectVerticalFieldDump(nonEmptyLines);
  if (verticalDumpRows) return verticalDumpRows;

  const spacingSplitRows = nonEmptyLines.map((line) =>
    line
      .trim()
      .split(/\s{2,}/)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== ""),
  );
  if (spacingSplitRows.length >= 2) {
    const maxCols = Math.max(...spacingSplitRows.map((row) => row.length));
    const multiColRows = spacingSplitRows.filter((row) => row.length >= 2).length;
    const minRowsForWideSplit = Math.max(2, Math.ceil(spacingSplitRows.length * 0.6));

    // Plain-text copies from report tables often use repeated spaces instead of tabs.
    // Only promote to matrix when most rows clearly look multi-column.
    if (maxCols >= 2 && multiColRows >= minRowsForWideSplit) {
      spacingSplitRows.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return spacingSplitRows;
    }
  }

  const flattenedStatementRows = detectFlattenedStatementMatrix(nonEmptyLines);
  if (flattenedStatementRows) return flattenedStatementRows;

  return nonEmptyLines.map((line) => [line]);
}

/** 1.Text — Excel plain text paste, preserving the clipboard matrix as-is. */
export function handleTextPlainPaste(e, pastedData, anchorCell) {
  const dataMatrix = parsePlainTextMatrix(pastedData);
  if (!dataMatrix.length) return false;

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    uppercaseValues: false,
    trimValues: false,
    alignTotalRows: false,
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

/**
 * Primary 1.TEXT path: plain matrix first (accurate columns), then simple HTML table.
 * No format-style enrichment — used before the shared Format pipeline in 1.Text mode.
 */
export function handleTextPlainFirstPaste(e, pastedData, anchorCell) {
  if (pastedData?.trim() && handleTextPlainPaste(e, pastedData, anchorCell)) {
    return true;
  }

  const html = getClipboardHtml(e);
  const htmlFromDetect = html ? "" : detectHtmlTableInClipboard(e);
  const rawHtmlCandidate = html || htmlFromDetect;
  const htmlCandidate =
    rawHtmlCandidate && clipboardHtmlLooksLikeGrid(rawHtmlCandidate)
      ? normalizeClipboardHtmlToTable(rawHtmlCandidate) || rawHtmlCandidate
      : rawHtmlCandidate;

  if (htmlCandidate && handleTextHtmlPaste(htmlCandidate, anchorCell)) return true;
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;
  return false;
}

/**
 * Full 1.Text path with format-style HTML fill when plain paths fail.
 * Used as fallback after handleTextPlainFirstPaste and handleFormatCellPaste.
 */
export function handleTextModePaste(e, pastedData, anchorCell) {
  const html = getClipboardHtml(e);
  const htmlFromDetect = html ? "" : detectHtmlTableInClipboard(e);
  const rawHtmlCandidate = html || htmlFromDetect;
  const htmlCandidate =
    rawHtmlCandidate && clipboardHtmlLooksLikeGrid(rawHtmlCandidate)
      ? normalizeClipboardHtmlToTable(rawHtmlCandidate) || rawHtmlCandidate
      : rawHtmlCandidate;

  if (htmlCandidate && htmlCandidate.includes("<table")) {
    if (parseAndFillHtmlTableForTextWithFormat(htmlCandidate, anchorCell)) return true;

    if (handleTextHtmlPaste(htmlCandidate, anchorCell)) {
      notifyPasteSuccess("格式保留失败，已按纯文本粘贴。", "danger");
      return true;
    }

    if (handleTextPlainPaste(e, pastedData, anchorCell)) {
      notifyPasteSuccess("格式保留失败，已按纯文本粘贴。", "danger");
      return true;
    }
    return false;
  }

  if (handleTextHtmlPaste(htmlCandidate, anchorCell)) return true;
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;

  return handleTextPlainPaste(e, pastedData, anchorCell);
}
