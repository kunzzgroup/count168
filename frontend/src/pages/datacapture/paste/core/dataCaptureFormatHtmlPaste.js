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
} from "./dataCaptureFormatHtmlMatrix.js";
import { finalizePasteWithOptionalConvert } from "../../grid/dataCaptureGridPasteHistory.js";

/** Match Citibet/generic apply: plain string cells, not rich {html} patches. */
function toPlainStringMatrix(bodyMatrix) {
  return bodyMatrix.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => {
      if (cell == null) return "";
      if (typeof cell === "string" || typeof cell === "number") return String(cell);
      return String(cell.value ?? "").trim();
    }),
  );
}

export function parseAndFillHtmlTableForFormat(htmlString, options = {}) {
  const startRow =
    Number.isFinite(options.startRow) && options.startRow >= 0 ? options.startRow : 0;
  const anchorCell = options.anchorCell || getDefaultPasteAnchorCell();

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

    const plainMatrix = toPlainStringMatrix(bodyMatrix);
    const appliedCols = Math.max(0, ...plainMatrix.map((row) => row.length));
    if (appliedCols < 2) {
      console.log(
        `Format: rejecting collapsed matrix (sourceMaxCols=${maxCols}, appliedCols=${appliedCols}) — falling back`,
      );
      return false;
    }

    const sample = (plainMatrix[0] || []).slice(0, 10);
    console.log(
      `Format: Applying ${plainMatrix.length} body row(s) at row ${startRow} (${dataRows.length} source data rows x ${appliedCols} cols)`,
      sample,
    );

    ensureGridFits(startRow, 0, plainMatrix.length, appliedCols);

    // Same apply shape as working 3.CITIBET / generic paste (plain strings + anchor).
    const { successCount } = applyDataMatrixToGrid(plainMatrix, anchorCell, {
      startRowOverride: startRow,
      startColOverride: 0,
      trimValues: false,
      uppercaseValues: false,
      alignTotalRows: false,
      deferUndoCheckpoint: true,
    });

    console.log(`Format: apply successCount=${successCount}`);

    if (successCount > 0) {
      notifyPasteUser(
        `成功粘贴表格 (${headerRows.length} 个表头行, ${plainMatrix.length} 个数据行 x ${appliedCols} 列)，已保持完整表格结构!`,
        "success",
      );
      finalizePasteWithOptionalConvert(successCount, {
        runConvert: false,
        beforeCommit: () => recomputeSubmitStateAfterPaste(),
      });
      return true;
    }

    console.log("Format: No cells were pasted");
    return false;
  } catch (error) {
    console.error("Format: Error parsing HTML table:", error);
    return false;
  }
}
