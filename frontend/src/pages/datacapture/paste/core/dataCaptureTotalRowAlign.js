/** Align TOTAL / SUB TOTAL / GRAND TOTAL rows with PHP paste behavior (drop empty name column). */

function trimCellValue(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "").trim();
  }
  return String(cell ?? "").trim();
}

function isNumericSerial(value) {
  return /^\d+$/.test(value) && value.length <= 6;
}

function isAlphaCode(value) {
  return /^[A-Za-z]{2,6}$/.test(value);
}

function isNameLike(value) {
  if (!value) return false;
  const cleaned = value.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return false;
  return true;
}

function isTotalLabel(value) {
  const upper = String(value || "").trim().toUpperCase();
  return upper === "TOTAL" || upper === "SUB TOTAL" || upper === "GRAND TOTAL";
}

/** True when regular rows use serial | code | name before numeric columns. */
export function matrixHasNameColumnPattern(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return false;

  let matches = 0;
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length < 4) continue;

    const col0 = trimCellValue(row[0]);
    const col1 = trimCellValue(row[1]);
    const col2 = trimCellValue(row[2]);

    if (isTotalLabel(col0) || isTotalLabel(col1)) continue;
    if (isNumericSerial(col0) && isAlphaCode(col1) && isNameLike(col2)) {
      matches += 1;
      if (matches >= 2) return true;
    }
  }

  return false;
}

function shouldCompressTotalGap(row, totalColIndex, nameColIndex) {
  const totalLabel = trimCellValue(row[totalColIndex]);
  if (!isTotalLabel(totalLabel)) return false;

  const nameCell = trimCellValue(row[nameColIndex]);
  if (nameCell !== "") return false;

  const nextCell = trimCellValue(row[nameColIndex + 1]);
  return nextCell !== "";
}

function compressRowGap(row, gapIndex) {
  const next = [...row];
  next.splice(gapIndex, 1);
  if (next.length < row.length) {
    next.push("");
  }
  return next;
}

/**
 * Remove the empty name column on TOTAL rows so numeric totals line up with PHP.
 * @param {Array<Array<string|object>>} matrix
 * @returns {Array<Array<string|object>>}
 */
export function alignTotalRowsInMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix;
  if (!matrixHasNameColumnPattern(matrix)) return matrix;

  let changed = false;
  const aligned = matrix.map((row) => {
    if (!Array.isArray(row) || row.length < 4) return row;

    if (shouldCompressTotalGap(row, 1, 2)) {
      changed = true;
      return compressRowGap(row, 2);
    }

    if (shouldCompressTotalGap(row, 0, 1)) {
      changed = true;
      return compressRowGap(row, 1);
    }

    return row;
  });

  if (changed) {
    console.log("Aligned TOTAL row columns to match PHP (removed empty name column gap).");
  }

  return aligned;
}

function getSnapshotDataText(rowData, dataColIndex) {
  const cell = rowData[dataColIndex + 1];
  if (!cell || cell.type !== "data") return "";
  return String(cell.value || "").trim();
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

  if (!matrixHasNameColumnPattern(probe)) return tableData;

  const working = JSON.parse(JSON.stringify(tableData));
  let changed = false;

  working.rows = working.rows.map((rowData) => {
    if (!Array.isArray(rowData) || rowData.length < 4) return rowData;

    const values = [];
    for (let i = 0; i < rowData.length - 1; i += 1) {
      values.push(getSnapshotDataText(rowData, i));
    }

    let nameColIndex = -1;
    if (shouldCompressTotalGap(values, 1, 2)) nameColIndex = 2;
    else if (shouldCompressTotalGap(values, 0, 1)) nameColIndex = 1;
    if (nameColIndex < 0) return rowData;

    const next = [...rowData];
    next.splice(nameColIndex + 1, 1);
    for (let i = 1; i < next.length; i += 1) {
      if (next[i]?.type === "data") {
        next[i] = { ...next[i], col: i - 1 };
      }
    }

    changed = true;
    return next;
  });

  if (!changed) return tableData;
  console.log("Submit snapshot: aligned TOTAL row columns to match PHP.");
  return working;
}
