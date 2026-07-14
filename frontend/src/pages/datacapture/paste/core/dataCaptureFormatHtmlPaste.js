/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c / PR6 batch 1). */

import { applyDataMatrixToGrid, ensureGridFits } from "./dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  parseFormatHtmlTableStructure,
  countFormatRequiredBodyRows,
  buildFormatBodyMatrix,
} from "./dataCaptureFormatHtmlMatrix.js";

function cellText(cell) {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell).trim();
  return String(cell?.value || cell?.html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellLooksMoneyOrNumber(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/[,$¥€£]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned) || /^\$?-?\d/.test(String(text).trim());
}

function cellLooksAgentId(text) {
  const t = String(text ?? "").trim();
  if (!t || cellLooksMoneyOrNumber(t)) return false;
  if (/^(SUBTOTAL|SUB TOTAL|TOTAL(?:\s+AMOUNT)?|GRAND\s*TOTAL)$/i.test(t)) return false;
  // Agent codes: AW9966, SDSPDA95, BSAM2424 — not prose.
  return /^[A-Za-z][A-Za-z0-9._-]{1,24}$/.test(t);
}

/**
 * Fig2 跑位: row N = only agent id in col0; row N+1 = only numbers across cols.
 * Reject so Format can retry another clipboard path instead of writing misaligned grid.
 */
export function formatBodyMatrixLooksIdNumberSplit(bodyMatrix) {
  if (!bodyMatrix || bodyMatrix.length < 2) return false;

  let splitPairs = 0;
  for (let i = 0; i < bodyMatrix.length - 1; i += 1) {
    const idRow = bodyMatrix[i] || [];
    const numRow = bodyMatrix[i + 1] || [];

    const idTexts = idRow.map(cellText);
    const numTexts = numRow.map(cellText);
    const idFilled = idTexts.filter(Boolean);
    const numFilled = numTexts.filter(Boolean);

    const idOnlyAgent =
      idFilled.length === 1 && cellLooksAgentId(idFilled[0]) && !idFilled.some(cellLooksMoneyOrNumber);
    const nextIsNumbers =
      numFilled.length >= 3 &&
      numFilled.filter(cellLooksMoneyOrNumber).length >= Math.ceil(numFilled.length * 0.75) &&
      !cellLooksAgentId(numTexts[0] || "");

    if (idOnlyAgent && nextIsNumbers) splitPairs += 1;
  }

  // At least one clear pair, or ≥2 pairs when many rows.
  if (splitPairs >= 1 && bodyMatrix.length <= 4) return true;
  if (splitPairs >= 2) return true;
  return false;
}

/** Plain string matrix variant of {@link formatBodyMatrixLooksIdNumberSplit}. */
export function formatPlainMatrixLooksIdNumberSplit(matrix) {
  if (!matrix?.length) return false;
  const asCells = matrix.map((row) => (row || []).map((value) => ({ value: String(value ?? "") })));
  return formatBodyMatrixLooksIdNumberSplit(asCells);
}

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

  if (formatBodyMatrixLooksIdNumberSplit(bodyMatrix)) return true;

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
        "Format: Rejecting collapsed/misaligned body matrix (will try another clipboard path)",
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
