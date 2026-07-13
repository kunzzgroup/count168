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

/** Paginator / info chrome row (DataTables drag-to-end over-select). */
export function rowLooksLikePaginatorRow(row) {
  if (!Array.isArray(row)) return false;
  const tokens = row.map((cell) => cellValue(cell)).filter(Boolean);
  if (!tokens.length) return true;
  if (tokens.every((token) => isPaginatorToken(token))) return true;
  const joined = tokens.join(" ").replace(/\s+/g, " ").trim();
  return /^Showing\s+\d+\s+to\s+\d+\s+of\s+\d+/i.test(joined);
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

/** Drop trailing empty / paginator / truncated stub rows (loop for multi-line chrome). */
export function dropTrailingJunkRows(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return matrix;

  let next = [...matrix];
  while (next.length > 1) {
    const last = next[next.length - 1];
    if (rowLooksLikePaginatorRow(last)) {
      next = next.slice(0, -1);
      continue;
    }

    const bodyWidths = next.slice(0, -1).map(countNonEmpty);
    const bodyWidth = Math.max(0, ...bodyWidths);
    if (bodyWidth < 3) break;

    const lastTokens = last.map((cell) => cellValue(cell)).filter(Boolean);
    if (!lastTokens.length) {
      next = next.slice(0, -1);
      continue;
    }

    const lastWidth = lastTokens.length;
    if (lastWidth >= bodyWidth - 1) break;

    const first = lastTokens[0];
    if (!isMoneyOrNumberLikeToken(first) && lastWidth < bodyWidth) {
      next = next.slice(0, -1);
      continue;
    }
    break;
  }
  return next;
}

/** @deprecated use dropTrailingJunkRows */
export function dropTrailingIncompleteRows(matrix) {
  return dropTrailingJunkRows(matrix);
}

/**
 * Plain string[][] or format cell matrix — trim, drop stubs, align Total rows.
 * @param {Array<Array<string|object>>} matrix
 */
export function sanitizePasteMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix;
  let next = trimTrailingEmptyColumns(matrix);
  next = dropTrailingJunkRows(next);
  next = alignTotalRowsInMatrix(next);
  next = trimTrailingEmptyColumns(next);
  return next;
}

/** True when clipboard plain TSV parses to a usable multi-column matrix. */
export function plainTabTextLooksPasteable(text) {
  if (!text || !String(text).includes("\t")) return false;
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "" && line.includes("\t"));
  if (!lines.length) return false;
  const widths = lines.map((line) => line.split("\t").length);
  const maxCols = Math.max(...widths);
  return maxCols >= 2;
}
