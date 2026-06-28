/**
 * TOTAL / 总数 row column alignment — matches the PHP site's visible result.
 *
 * Data rows look like `serial | name | num1 | num2 | ...`, while a total row may
 * arrive as `TOTAL | num1 | ...` (missing the empty name column) and end up one
 * column to the left. `alignTotalRowsInMatrix` shifts such total rows right by
 * inserting blank name-column cells so their first number lines up under the
 * data rows' first numeric column. Cells are only ever inserted, never removed,
 * so rows that already align (e.g. `TOTAL | "" | num1`) are left untouched.
 *
 * The per-row helper `alignTotalRowArray` stays a no-op: the grid/snapshot
 * callers lack the full-matrix context needed to know the data number column,
 * and by the time they run the paste matrix has already been aligned.
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
 * Preserve the source TOTAL row exactly as pasted (matches PHP).
 *
 * PHP keeps the empty name-column gap after the TOTAL label and treats the row
 * as an identifier row (never shifted), so the first total value stays under the
 * data rows' first numeric column. Removing the gap here would shift totals one
 * column to the left and misalign them, so this is intentionally a no-op.
 */
export function alignTotalRowArray(row) {
  return row;
}

/**
 * Render TOTAL / 总数 rows exactly as captured (matches PHP).
 *
 * PHP keeps the label in column 1 with its numbers immediately after and never
 * inserts a name-column gap — the total row therefore sits one column to the
 * left of the data rows' numeric columns. Inserting a gap here would shift the
 * row one column right and diverge from PHP, so the pasted matrix is returned
 * unchanged.
 *
 * @param {Array<Array<string|object>>} matrix
 * @returns {Array<Array<string|object>>}
 */
export function alignTotalRowsInMatrix(matrix) {
  return matrix;
}

function getSnapshotDataText(rowData, dataColIndex) {
  const cell = rowData[dataColIndex + 1];
  if (!cell || cell.type !== "data") return "";
  return String(cell.value || "").trim();
}

export function alignSnapshotRow(rowData) {
  if (!Array.isArray(rowData) || rowData.length < 4) return rowData;

  const values = [];
  for (let i = 0; i < rowData.length - 1; i += 1) {
    values.push(getSnapshotDataText(rowData, i));
  }

  const alignedValues = alignTotalRowArray(values);
  if (alignedValues === values) return rowData;

  const next = [rowData[0]];
  for (let i = 0; i < alignedValues.length; i += 1) {
    const prev = rowData[i + 1];
    const value = alignedValues[i];
    if (prev?.type === "data") {
      next.push({ ...prev, value, col: i });
    } else {
      next.push({ type: "data", value, col: i });
    }
  }

  return next;
}

/**
 * Submit-time snapshot fix (same rule as paste matrix alignment).
 * @param {object} tableData
 * @returns {object}
 */
export function alignTotalRowsInSnapshot(tableData) {
  if (!tableData?.rows?.length) return tableData;

  const probe = tableData.rows.map((rowData) => {
    const values = [];
    for (let i = 0; i < Math.max(0, (rowData?.length || 1) - 1); i += 1) {
      values.push(getSnapshotDataText(rowData, i));
    }
    return values;
  });

  if (!matrixHasNameColumnPattern(probe) && !probe.some(rowHasTotalLabel)) return tableData;

  const working = JSON.parse(JSON.stringify(tableData));
  let changed = false;

  working.rows = working.rows.map((rowData) => {
    const aligned = alignSnapshotRow(rowData);
    if (aligned !== rowData) changed = true;
    return aligned;
  });

  if (!changed) return tableData;
  console.log("Submit snapshot: aligned TOTAL row columns to match PHP.");
  return working;
}
