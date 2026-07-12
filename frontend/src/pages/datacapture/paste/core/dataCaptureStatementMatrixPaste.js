/**
 * Citibet-style plain-text matrix paste for billing statements.
 * Used by 1.Text / 2.Format so Material report copies land as Excel-like grids
 * without relying on the HTML format-fill pipeline.
 */
import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";

export function plainTextLooksLikeBillingStatement(text) {
  const upper = String(text || "")
    .replace(/\u00a0/g, " ")
    .toUpperCase();
  if (!upper.trim()) return false;
  const hasSubtotal = upper.includes("SUBTOTAL") || upper.includes("SUB TOTAL");
  const hasTotalAmount = upper.includes("TOTAL AMOUNT");
  return hasSubtotal && hasTotalAmount;
}

/**
 * Build + apply a multi-column matrix from plain clipboard text (same family as 3.CITIBET).
 * @returns {boolean}
 */
export function tryApplyBillingStatementPlainMatrix(pastedData, anchorCell, options = {}) {
  if (!plainTextLooksLikeBillingStatement(pastedData)) return false;

  const dataMatrix = parsePlainTextMatrix(pastedData);
  if (!dataMatrix.length) return false;

  const maxCols = Math.max(...dataMatrix.map((row) => row.length));
  if (maxCols < 2) {
    console.log("Statement plain matrix: still 1-col after parse, skip");
    return false;
  }

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    uppercaseValues: false,
    trimValues: false,
    alignTotalRows: false,
    startRowOverride: options.startRowOverride,
    startColOverride: options.startColOverride ?? 0,
  });

  if (successCount <= 0) return false;

  console.log(`Statement plain matrix (Citibet-style): ${maxRows} rows x ${cols} cols`, dataMatrix[0]);
  notifyPasteSuccess(
    `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已按Excel矩阵排列!`,
  );
  return true;
}
