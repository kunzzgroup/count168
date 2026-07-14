/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c / PR6 batch 1). */

import { applyDataMatrixToGrid, ensureGridFits } from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  parseFormatHtmlTableStructure,
  countFormatRequiredBodyRows,
  buildFormatBodyMatrix,
} from "./dataCaptureFormatHtmlMatrix.js";

/**
 * User symptom: "Applying 1 body row(s) … (3 source data rows)" then col1 stack.
 * Reject so Format can fall through to plain dual-source reshape.
 */
export function formatBodyMatrixLooksCollapsed(bodyMatrix, dataRows) {
  const sourceCount = dataRows?.length || 0;
  const matrixRows = bodyMatrix?.length || 0;
  if (!matrixRows) return true;

  // Classic failure log: many source TRs collapsed into one matrix row.
  if (sourceCount >= 3 && matrixRows === 1) return true;

  const nonEmptyCols = (row) =>
    (row || []).filter((cell) => String(cell?.value || cell?.html || "").trim()).length;

  const maxFilledCols = Math.max(...bodyMatrix.map(nonEmptyCols), 0);
  const totalFilled = bodyMatrix.reduce((sum, row) => sum + nonEmptyCols(row), 0);

  // N×1 dump: many rows, only first column filled, looks like field-per-row.
  if (matrixRows >= 6 && maxFilledCols <= 1 && totalFilled >= 6) return true;

  // One (or few) cells still holding a whole multi-field report dump.
  const hasStackedDumpCell = bodyMatrix.some((row) =>
    (row || []).some((cell) => {
      const text = String(cell?.value || "")
        .replace(/\u00a0/g, " ")
        .trim();
      const html = String(cell?.html || "");
      const moneyHits = (text.match(/\$[\d,]+(?:\.\d+)?/g) || []).length;
      const lineHits = text.split(/\r?\n/).filter((line) => line.trim()).length;
      const nestedBlocks = (html.match(/<(?:div|p|span|br)\b/gi) || []).length;
      return moneyHits >= 3 || lineHits >= 3 || (nestedBlocks >= 3 && moneyHits >= 1);
    }),
  );
  if (hasStackedDumpCell && maxFilledCols <= 2) return true;

  return false;
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

    ensureGridFits(startRow, 0, countFormatRequiredBodyRows(dataRows), maxCols);

    const bodyMatrix = buildFormatBodyMatrix(dataRows, maxCols);
    console.log(
      `Format: Applying ${bodyMatrix.length} body row(s) at row ${startRow} (${dataRows.length} source data rows)`,
    );

    if (
      !options.acceptCollapsedMatrix &&
      formatBodyMatrixLooksCollapsed(bodyMatrix, dataRows)
    ) {
      console.log(
        "Format: Rejecting collapsed body matrix (will try plain dual-source if available)",
      );
      return false;
    }

    const { successCount: bodySuccessCount } = applyDataMatrixToGrid(bodyMatrix, null, {
      startRowOverride: startRow,
      startColOverride: 0,
      trimValues: false,
      alignTotalRows: false,
    });

    const successCount = bodySuccessCount;

    if (successCount > 0) {
      notifyPasteUser(
        `成功粘贴表格 (${headerRows.length} 个表头行, ${dataRows.length} 个数据行 x ${maxCols} 列)，已保持完整表格结构!`,
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
