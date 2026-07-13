/**
 * DataCaptureImporter — converts ParsedTable / AccountingRecord[] to matrix
 * and writes via existing applyParsedMatrixToGrid (no parallel grid writer).
 */
import { applyParsedMatrixToGrid } from "../core/dataCapturePasteApply.js";
import { cellText } from "./utils/tableStats.js";

/**
 * @param {{ headers?: string[], rows: string[][], meta?: object }} detected
 * @param {{ includeHeaderRow?: boolean, includeFooterRows?: boolean }} [opts]
 * @returns {string[][]}
 */
export function detectedTableToMatrix(detected, opts = {}) {
  const includeHeaderRow = opts.includeHeaderRow !== false;
  const includeFooterRows = opts.includeFooterRows === true;
  const matrix = [];

  if (
    includeHeaderRow &&
    detected?.headers?.length &&
    !detected?.meta?.hadSyntheticHeaders
  ) {
    matrix.push(detected.headers.map(cellText));
  }

  (detected?.rows || []).forEach((row) => {
    matrix.push((row || []).map(cellText));
  });

  if (includeFooterRows && detected?.footerRows?.length) {
    detected.footerRows.forEach((row) => matrix.push((row || []).map(cellText)));
  }

  return matrix;
}

/**
 * @param {Array<Record<string, unknown>>} records
 * @returns {string[][]}
 */
export function accountingRecordsToMatrix(records) {
  const headers = [
    "document_no",
    "date",
    "supplier",
    "description",
    "amount",
    "tax",
    "total",
  ];
  const matrix = [headers];
  (records || []).forEach((rec) => {
    matrix.push(headers.map((h) => cellText(rec?.[h])));
  });
  return matrix;
}

export class DataCaptureImporter {
  /**
   * @param {string[][]} matrix
   * @param {HTMLElement|null} cell
   * @param {object} [options] passed to applyParsedMatrixToGrid
   */
  importMatrix(matrix, cell, options = {}) {
    if (!matrix?.length) {
      return { applied: false, successCount: 0, reason: "EMPTY_MATRIX" };
    }

    const {
      successMessage = "Smart paste imported successfully.",
      emptyMessage = "Smart paste produced no cells.",
      chunkSize = 0,
      ...rest
    } = options;

    // Phase 1: single apply; chunkSize reserved for large-table follow-up
    if (chunkSize > 0 && matrix.length > chunkSize) {
      let totalSuccess = 0;
      let last = null;
      for (let i = 0; i < matrix.length; i += chunkSize) {
        const slice = matrix.slice(i, i + chunkSize);
        const startRowOverride =
          rest.startRowOverride != null ? rest.startRowOverride + i : undefined;
        last = applyParsedMatrixToGrid(slice, cell, {
          ...rest,
          startRowOverride,
          successMessage: i + chunkSize >= matrix.length ? successMessage : undefined,
          emptyMessage: undefined,
          deferUndoCheckpoint: i + chunkSize < matrix.length,
        });
        totalSuccess += last.successCount || 0;
      }
      return {
        ...(last || {}),
        applied: totalSuccess > 0,
        successCount: totalSuccess,
        mode: "chunked",
      };
    }

    const result = applyParsedMatrixToGrid(matrix, cell, {
      successMessage,
      emptyMessage,
      ...rest,
    });
    return { ...result, mode: "single" };
  }

  importParsedTable(detected, cell, options = {}) {
    const matrix = detectedTableToMatrix(detected, options);
    return this.importMatrix(matrix, cell, options);
  }

  importAccountingRecords(records, cell, options = {}) {
    const matrix = accountingRecordsToMatrix(records);
    return this.importMatrix(matrix, cell, {
      successMessage: "Accounting records imported.",
      ...options,
    });
  }
}

export const dataCaptureImporter = new DataCaptureImporter();
