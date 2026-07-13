/**
 * Shared paste-matrix cleanup for 1.TEXT + 2.Format (over-select / Total row gaps).
 */
import { alignTotalRowsInMatrix } from "./dataCaptureTotalRowAlign.js";

function cellValue(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "").trim();
  }
  return String(cell ?? "").trim();
}

function makeBlankCellLike(row) {
  const sample = row?.find((cell) => cell != null && typeof cell === "object" && "value" in cell);
  return sample ? { value: "" } : "";
}

function isMoneyOrNumberLikeToken(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/[,$]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function isPaginatorToken(text) {
  const upper = String(text ?? "")
    .trim()
    .replace(/:$/, "")
    .toUpperCase();
  return (
    upper === "SHOWING" ||
    upper === "ENTRIES" ||
    upper === "TO" ||
    upper === "OF" ||
    /^\d{1,4}$/.test(upper)
  );
}

function countNonEmpty(row) {
  if (!Array.isArray(row)) return 0;
  return row.filter((cell) => cellValue(cell) !== "").length;
}

/** Drop trailing empty tab/HTML columns after drag-to-end over-select. */
export function trimTrailingEmptyColumns(matrix) {
  if (!matrix?.length) return matrix;

  let lastNonEmpty = -1;
  matrix.forEach((row) => {
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (cellValue(row[i]) !== "") {
        lastNonEmpty = Math.max(lastNonEmpty, i);
        break;
      }
    }
  });
  if (lastNonEmpty < 0) return matrix;

  const width = lastNonEmpty + 1;
  return matrix.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push(makeBlankCellLike(row));
    return next;
  });
}

/** Drop a short trailing stub row (partial next row / paginator chrome). */
export function dropTrailingIncompleteRows(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return matrix;

  const bodyWidths = matrix.slice(0, -1).map(countNonEmpty);
  const bodyWidth = Math.max(0, ...bodyWidths);
  if (bodyWidth < 3) return matrix;

  const last = matrix[matrix.length - 1];
  const lastTokens = last.map((cell) => cellValue(cell)).filter(Boolean);
  if (!lastTokens.length) return matrix.slice(0, -1);

  const lastWidth = lastTokens.length;
  if (lastWidth >= bodyWidth - 1) return matrix;

  const first = lastTokens[0];
  const mostlyPaginator = lastTokens.every((token) => isPaginatorToken(token));
  if (mostlyPaginator) return matrix.slice(0, -1);

  // Truncated next row: label + a few numbers, shorter than body rows.
  if (!isMoneyOrNumberLikeToken(first) && lastWidth < bodyWidth) {
    return matrix.slice(0, -1);
  }

  return matrix;
}

/**
 * Plain string[][] or format cell matrix — trim, drop stubs, align Total rows.
 * @param {Array<Array<string|object>>} matrix
 */
export function sanitizePasteMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix;
  let next = trimTrailingEmptyColumns(matrix);
  next = dropTrailingIncompleteRows(next);
  next = alignTotalRowsInMatrix(next);
  next = trimTrailingEmptyColumns(next);
  return next;
}
