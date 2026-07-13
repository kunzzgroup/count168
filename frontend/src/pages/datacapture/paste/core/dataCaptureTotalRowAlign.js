/**
 * TOTAL / 总数 row helpers.
 *
 * Clipboard / HTML empty cells between a Total label and its first number are
 * preserved 1:1 (web report name-column gaps). Do not collapse those blanks —
 * over-select cleanup lives in dataCapturePasteMatrixSanitize.js only.
 *
 * SUB TOTAL / GRAND TOTAL never had gap collapse; English TOTAL / CJK 总数
 * follow the same preserve rule now.
 */

function trimCellValue(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "").trim();
  }
  return String(cell ?? "").trim();
}

function isBlankCell(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim() === "";
}

function isNumericSerial(value) {
  return /^\d+$/.test(value) && value.length <= 6;
}

function isAlphaCode(value) {
  return /^[A-Za-z]{2,8}\d*$/.test(value);
}

function isNameLike(value) {
  if (isBlankCell(value)) return false;
  const cleaned = String(value).replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return false;
  return true;
}

const CJK_TOTAL_LABELS = new Set(["总数", "总计", "合计", "總數", "總計", "合計"]);

function isTotalLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  if (upper === "TOTAL" || upper === "SUB TOTAL" || upper === "GRAND TOTAL") return true;
  return CJK_TOTAL_LABELS.has(raw);
}

function rowHasTotalLabel(row) {
  if (!Array.isArray(row)) return false;
  for (let i = 0; i < Math.min(row.length, 4); i += 1) {
    if (isTotalLabel(trimCellValue(row[i]))) return true;
  }
  return false;
}

/** True when regular rows use serial | code | name before numeric columns. */
export function matrixHasNameColumnPattern(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return false;

  let matches = 0;
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length < 3) continue;

    const col0 = trimCellValue(row[0]);
    const col1 = trimCellValue(row[1]);
    const col2 = trimCellValue(row[2]);

    if (rowHasTotalLabel(row)) continue;
    if (isNumericSerial(col0) && isAlphaCode(col1) && isNameLike(col2)) {
      matches += 1;
      if (matches >= 1) return true;
    }
  }

  return false;
}

/**
 * Preserve Total-row shape 1:1 (no label→number gap collapse).
 * @param {Array<string|object>} row
 */
export function alignTotalRowArray(row) {
  return row;
}

/**
 * Preserve Total-row empty cells 1:1 from clipboard / HTML matrix.
 * @param {Array<Array<string|object>>} matrix
 */
export function alignTotalRowsInMatrix(matrix) {
  return matrix;
}

/** Snapshot path: keep pasted Total gaps (same rule as paste matrix). */
export function alignSnapshotRow(rowData) {
  return rowData;
}

/**
 * Submit-time snapshot: no Total-gap rewrite.
 * @param {object} tableData
 */
export function alignTotalRowsInSnapshot(tableData) {
  return tableData;
}
