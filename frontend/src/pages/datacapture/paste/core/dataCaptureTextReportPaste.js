/**
 * 1.TEXT report paste — Grill: matrix-first, style-second.
 * Plain TSV is alignment source of truth; styles only when HTML aligns.
 */
import { handleFormatCellPaste } from "./dataCaptureFormatPasteHandler.js";
import { plainMatrixLooksReliable } from "./dataCapturePasteMatrixSanitize.js";
import {
  handleTextModePaste,
  handleTextPlainFirstPaste,
  handleTextPlainPaste,
  parsePlainTextMatrix,
} from "./dataCaptureTextPaste.js";

/**
 * @returns {boolean}
 */
export function handleTextReportPaste(e, pastedData, anchorCell) {
  const plainMatrix = pastedData?.trim() ? parsePlainTextMatrix(pastedData) : [];
  const hasReliablePlain = plainMatrixLooksReliable(plainMatrix);

  if (hasReliablePlain) {
    // Try styled pipeline with plain cross-check inside Format HTML fill.
    if (handleFormatCellPaste(e, pastedData, { allowOutsideFormatMode: true })) {
      return true;
    }
    // Silent fallback to plain matrix (alignment hard gate; no style).
    return handleTextPlainPaste(e, pastedData, anchorCell);
  }

  // No reliable plain: structure-heuristic Format, then plain/HTML safety net.
  if (handleFormatCellPaste(e, pastedData, { allowOutsideFormatMode: true })) {
    return true;
  }
  if (handleTextPlainFirstPaste(e, pastedData, anchorCell)) return true;
  return handleTextModePaste(e, pastedData, anchorCell);
}
