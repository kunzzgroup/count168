/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c / PR6 batch 1). */

import { applyDataMatrixToGrid, ensureGridFits } from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  parseFormatHtmlTableStructure,
  buildFormatBodyMatrix,
} from "./dataCaptureFormatHtmlMatrix.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import {
  plainMatrixToHtmlTable,
  plainMatrixToStyledHtmlTable,
} from "./dataCaptureFormatPreview.js";

function cellPatchValue(cell) {
  return String(cell?.value ?? cell ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Body matrix is a vertical field dump (one token per row in col0). */
function formatBodyMatrixLooksLikeVerticalDump(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 3) return false;
  const tokens = [];
  let singleFilled = 0;
  matrix.forEach((row) => {
    const filled = (row || [])
      .map((cell, index) => ({ index, value: cellPatchValue(cell) }))
      .filter((entry) => entry.value);
    if (filled.length === 1 && filled[0].index === 0) {
      singleFilled += 1;
      tokens.push(filled[0].value);
    }
  });
  if (singleFilled < Math.max(3, Math.ceil(matrix.length * 0.75))) return false;
  const moneyLike = tokens.filter((token) =>
    /^\$?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\$?-?\d+(?:\.\d+)?$/.test(token),
  ).length;
  return moneyLike >= 2;
}

function reshapeVerticalDumpBodyMatrix(matrix, htmlHintsSource = "") {
  const tokens = matrix
    .map((row) => cellPatchValue((row || [])[0]))
    .filter(Boolean);
  if (tokens.length < 3) return null;
  const reshaped = parsePlainTextMatrix(tokens.join("\n"));
  if (!reshaped?.length || (reshaped[0]?.length || 0) < 2) return null;
  const tableHtml =
    plainMatrixToStyledHtmlTable(reshaped, htmlHintsSource) || plainMatrixToHtmlTable(reshaped);
  if (!tableHtml) return null;
  const structure = parseFormatHtmlTableStructure(tableHtml);
  if (!structure) return null;
  return buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
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

    let bodyMatrix = buildFormatBodyMatrix(dataRows, maxCols);
    if (formatBodyMatrixLooksLikeVerticalDump(bodyMatrix)) {
      const reshaped = reshapeVerticalDumpBodyMatrix(bodyMatrix, htmlString);
      if (reshaped?.length) {
        console.log(
          `Format: Reshaped vertical field dump ${bodyMatrix.length}×1 → ${reshaped.length}×${reshaped[0]?.length || 0}`,
        );
        bodyMatrix = reshaped;
      }
    }

    const bodyCols = Math.max(
      maxCols,
      ...bodyMatrix.map((row) => (Array.isArray(row) ? row.length : 0)),
      1,
    );
    ensureGridFits(startRow, 0, bodyMatrix.length, bodyCols);

    console.log(
      `Format: Applying ${bodyMatrix.length} body row(s) at row ${startRow} (${dataRows.length} source data rows)`,
    );

    const { successCount: bodySuccessCount } = applyDataMatrixToGrid(bodyMatrix, null, {
      startRowOverride: startRow,
      startColOverride: 0,
      trimValues: false,
      alignTotalRows: false,
    });

    const successCount = bodySuccessCount;

    if (successCount > 0) {
      notifyPasteUser(
        `成功粘贴表格 (${headerRows.length} 个表头行, ${bodyMatrix.length} 个数据行 x ${bodyCols} 列)，已保持完整表格结构!`,
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
