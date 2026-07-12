/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c / PR6 batch 1). */

import {
  applyDataMatrixToGrid,
  ensureGridFits,
  getDefaultPasteAnchorCell,
} from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  parseFormatHtmlTableStructure,
  buildFormatBodyMatrix,
  reshapeCollapsedFormatMatrix,
} from "./dataCaptureFormatHtmlMatrix.js";

function cellPlainValue(cell) {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  return String(cell.value ?? "");
}

/** Count columns that actually hold values (ignore empty padding). */
function countFilledColumns(matrix) {
  let maxFilled = 0;
  matrix.forEach((row) => {
    if (!Array.isArray(row)) return;
    let last = -1;
    row.forEach((cell, index) => {
      if (cellPlainValue(cell).trim()) last = index;
    });
    maxFilled = Math.max(maxFilled, last + 1);
  });
  return maxFilled;
}

/** Citibet-style: plain string[][] only — no html patches that stack in one cell. */
function toPlainStringMatrix(matrix) {
  return matrix.map((row) => {
    if (!Array.isArray(row)) return [""];
    return row.map((cell) => cellPlainValue(cell));
  });
}

export function parseAndFillHtmlTableForFormat(htmlString, options = {}) {
  const startRow =
    Number.isFinite(options.startRow) && options.startRow >= 0 ? options.startRow : 0;

  try {
    const hasBrInOriginal =
      /<br\s+[^>]*>/i.test(htmlString) || /<br\s*\/?>/i.test(htmlString);
    console.log(
      `Format: Parsing HTML table with header support... hasBrInOriginal=${hasBrInOriginal}`,
    );

    const structure = parseFormatHtmlTableStructure(htmlString);
    if (!structure) {
      return false;
    }

    const { headerRows, dataRows, maxCols } = structure;

    let bodyMatrix;
    try {
      bodyMatrix = buildFormatBodyMatrix(dataRows, Math.max(maxCols, 1));
    } catch (err) {
      console.warn("Format: buildFormatBodyMatrix failed", err);
      return false;
    }

    // Second reshape pass in case only col0 was filled with stacked tokens.
    bodyMatrix = reshapeCollapsedFormatMatrix(bodyMatrix);

    const filledCols = countFilledColumns(bodyMatrix);
    if (filledCols < 2) {
      console.log(
        `Format: rejecting matrix with only ${filledCols} filled col(s) (padded length may still be ${bodyMatrix[0]?.length})`,
      );
      return false;
    }

    // Trim trailing empty columns so apply width matches real data.
    const plainMatrix = toPlainStringMatrix(bodyMatrix).map((row) => row.slice(0, filledCols));
    const sample = (plainMatrix[0] || []).slice(0, 10);
    console.log(
      `Format: Applying ${plainMatrix.length} body row(s) at row ${startRow} (${filledCols} filled cols, Citibet-style plain matrix)`,
      sample,
    );

    const anchor = getDefaultPasteAnchorCell();
    ensureGridFits(startRow, 0, plainMatrix.length, filledCols);

    const { successCount } = applyDataMatrixToGrid(plainMatrix, anchor, {
      startRowOverride: startRow,
      startColOverride: 0,
      trimValues: false,
      alignTotalRows: false,
      uppercaseValues: false,
    });

    if (successCount > 0) {
      notifyPasteUser(
        `成功粘贴表格 (${headerRows.length} 个表头行, ${plainMatrix.length} 个数据行 x ${filledCols} 列)，已保持完整表格结构!`,
        "success",
      );
      recomputeSubmitStateAfterPaste();
      return true;
    }

    console.log("Format: No cells were pasted");
    return false;
  } catch (error) {
    console.error("Format: Error parsing HTML table:", error);
    return false;
  }
}
