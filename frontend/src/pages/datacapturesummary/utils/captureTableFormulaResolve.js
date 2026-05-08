/** Mirrors legacy js/datacapturesummary.js helpers for reading formulas from captured table JSON */

export function normalizeIdProductText(text) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.indexOf(" - ") >= 0) return trimmed.replace(/\s+$/, "").trim();
  const match = trimmed.match(/^([^(]+)/);
  if (match) return match[1].replace(/\s+$/, "").trim();
  return trimmed.replace(/\s+$/, "").trim();
}

export function isFullIdProduct(value) {
  if (!value || typeof value !== "string") return false;
  const t = value.trim();
  if (t.indexOf(" - ") >= 0) return true;
  const openParen = t.indexOf("(");
  return openParen > 0 && t.indexOf(")", openParen) > openParen;
}

export function parseIdProductColumnRef(part) {
  const p = (part || "").trim();
  if (!p) return null;
  const lastColon = p.lastIndexOf(":");
  if (lastColon <= 0) return null;
  const colPart = p.substring(lastColon + 1);
  const dataColumnIndex = parseInt(colPart, 10);
  if (Number.isNaN(dataColumnIndex) || colPart !== String(dataColumnIndex)) return null;
  const rest = p.substring(0, lastColon);
  const rowIdxSegMatch = rest.match(/:#(\d+)$/);
  if (rowIdxSegMatch) {
    const captureRowIndex = parseInt(rowIdxSegMatch[1], 10);
    const idProduct = rest.substring(0, rest.length - rowIdxSegMatch[0].length);
    return { idProduct, rowLabel: null, dataColumnIndex, captureRowIndex };
  }
  const rowLabelMatch = rest.match(/:([A-Z]+)$/);
  let idProduct;
  let rowLabel = null;
  if (rowLabelMatch) {
    rowLabel = rowLabelMatch[1];
    idProduct = rest.substring(0, rest.length - rowLabel.length - 1);
  } else {
    idProduct = rest;
  }
  return { idProduct, rowLabel, dataColumnIndex, captureRowIndex: null };
}

export function isNewIdProductColumnFormat(sourceColumnsValue) {
  if (!sourceColumnsValue || sourceColumnsValue.trim() === "") return false;
  const parts = sourceColumnsValue.split(/\s+/).filter((c) => c.trim() !== "");
  if (parts.length === 0) return false;
  return parseIdProductColumnRef(parts[0]) !== null;
}

export function extractOperatorsSequence(expression) {
  if (!expression || typeof expression !== "string") return "";
  const sanitized = expression.replace(/\s+/g, "");
  let operators = "";
  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];
    if ("+-*/".includes(char)) {
      const prevChar = sanitized[i - 1] || "";
      if (char === "-" && (i === 0 || "(*+-/".includes(prevChar))) continue;
      operators += char;
    }
  }
  return operators;
}

export function findProcessRow(tableData, processValue, rowIndex = null) {
  const rows = tableData?.rows;
  if (!Array.isArray(rows)) return null;

  const processValueResolved = (processValue || "").trim();
  const normalizedProcessValue = normalizeIdProductText(processValueResolved);
  const useExactOnly = isFullIdProduct(processValueResolved);
  const normalizeSpaces = (s) => (s || "").trim().replace(/\s+/g, "");

  if (rowIndex !== null && rowIndex >= 0 && rowIndex < rows.length) {
    const row = rows[rowIndex];
    if (row && row.length > 1 && row[1]?.type === "data") {
      const rowValue = row[1].value;
      const normalizedRowValue = normalizeIdProductText(rowValue);
      const exactMatch = rowValue === processValueResolved;
      const normalizedMatch = !useExactOnly && normalizedRowValue && normalizedRowValue === normalizedProcessValue;
      if (exactMatch || normalizedMatch) return row;
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length > 1 && row[1]?.type === "data") {
      const rowValue = row[1].value;
      if (rowValue === processValueResolved) return row;
      if (useExactOnly && normalizeSpaces(rowValue) === normalizeSpaces(processValueResolved)) return row;
      if (!useExactOnly) {
        const normalizedRowValue = normalizeIdProductText(rowValue);
        if (normalizedRowValue && normalizedRowValue === normalizedProcessValue) return row;
      }
    }
  }

  const fallbackTarget = normalizeIdProductText(processValueResolved);
  if (fallbackTarget) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.length > 1 && row[1]?.type === "data") {
        const raw = row[1].value;
        const candidate = normalizeIdProductText(raw);
        if (candidate && candidate === fallbackTarget) return row;
      }
    }
  }

  return null;
}

export function readDataColumnCellFromProcessRow(processRow, columnIndex) {
  if (!processRow || columnIndex == null) return null;
  const processRowIndex = columnIndex + 1;
  if (processRowIndex < 2 || processRowIndex >= processRow.length) return null;
  const cellData = processRow[processRowIndex];
  if (!cellData || cellData.type !== "data" || cellData.value === null || cellData.value === undefined || cellData.value === "") return null;
  let cellValue = cellData.value.toString().trim();
  cellValue = cellValue.replace(/^\s*\([A-Za-z]{2,4}\)\s*/g, "").trim();
  cellValue = cellValue.replace(/\$/g, "");
  let numericValue = cellValue.replace(/[^0-9+\-*/.\s()]/g, "").trim();
  numericValue = numericValue.replace(/^\s*\(\s*\)\s*/, "").trim();
  if (numericValue && /^\(\s*-\d[\d.]*\)\s*$/.test(numericValue)) {
    const inner = numericValue.replace(/^\s*\(|\)\s*$/g, "").trim();
    if (!Number.isNaN(parseFloat(inner))) numericValue = inner;
  } else if (numericValue && /^\(\s*\d[\d.]*\)\s*$/.test(numericValue)) {
    const inner = numericValue.replace(/^\s*\(|\)\s*$/g, "").trim();
    if (!Number.isNaN(parseFloat(inner))) numericValue = `-${inner}`;
  }
  return numericValue && numericValue !== "" ? numericValue : cellValue;
}

function getCellValuesFromNewFormat(tableData, sourceColumnsValue, defaultCaptureRowIndex) {
  if (!sourceColumnsValue || sourceColumnsValue.trim() === "") return [];
  const parts = sourceColumnsValue.split(/\s+/).filter((c) => c.trim() !== "");
  const cellValues = [];

  parts.forEach((part) => {
    const parsed = parseIdProductColumnRef(part);
    if (!parsed) return;
    const { idProduct, dataColumnIndex, captureRowIndex } = parsed;
    const rowIdx = captureRowIndex != null ? captureRowIndex : defaultCaptureRowIndex;
    let processRow = null;
    if (rowIdx != null && rowIdx !== "") {
      processRow = findProcessRow(tableData, idProduct, Number(rowIdx));
    }
    if (!processRow) processRow = findProcessRow(tableData, idProduct);
    if (!processRow) return;
    const val = readDataColumnCellFromProcessRow(processRow, dataColumnIndex);
    if (val !== null && val !== "") cellValues.push(val);
  });

  return cellValues;
}

const CELL_POS_RE = /^[A-Z]+\d+$/i;

export function resolveFormulaExpressionFromTemplate(mainTemplate, tableData, defaultCaptureRowIndex) {
  const sourceColumnsValue = (mainTemplate.source_columns || "").trim();
  const formulaOperatorsValue = (mainTemplate.formula_operators || "").trim();
  const formulaDisplayForManual = (mainTemplate.formula_display || "").trim();
  const savedSourceValue = (mainTemplate.last_source_value || "").trim();

  if (!sourceColumnsValue && !formulaOperatorsValue && formulaDisplayForManual) {
    const manualSrcPct = mainTemplate.source_percent != null ? String(mainTemplate.source_percent).trim() : "";
    if (manualSrcPct !== "" && Math.abs(parseFloat(manualSrcPct) - 1) < 0.0001) {
      return { formula: formulaDisplayForManual.replace(/\*\s*\(?\s*1\s*\)?\s*$/i, "").trim() || formulaDisplayForManual, source: String(mainTemplate.source_percent ?? "1") };
    }
    return { formula: formulaDisplayForManual, source: String(mainTemplate.source_percent ?? "1") };
  }

  if (isNewIdProductColumnFormat(sourceColumnsValue) && tableData?.rows) {
    const rawVals = getCellValuesFromNewFormat(tableData, sourceColumnsValue, defaultCaptureRowIndex);
    if (rawVals.length > 0) {
      const ops = formulaOperatorsValue ? extractOperatorsSequence(formulaOperatorsValue) || "+" : "+";
      let expression = rawVals[0];
      for (let i = 1; i < rawVals.length; i += 1) {
        expression += (ops[i - 1] || "+") + rawVals[i];
      }
      return { formula: expression, source: String(mainTemplate.source_percent ?? "1") };
    }
  }

  const cellPositions = sourceColumnsValue ? sourceColumnsValue.split(/\s+/).filter((c) => c.trim() !== "") : [];
  const isCellPositionFormat = cellPositions.length > 0 && CELL_POS_RE.test(cellPositions[0]);

  if (isCellPositionFormat && tableData?.rows) {
    const operatorsString = formulaOperatorsValue ? extractOperatorsSequence(formulaOperatorsValue) || "+" : "+";
    const cellValues = [];
    const baseRowIdx = defaultCaptureRowIndex != null && defaultCaptureRowIndex >= 0 ? defaultCaptureRowIndex : 0;
    cellPositions.forEach((cellPosition) => {
      const m = cellPosition.match(/^([A-Z]+)(\d+)$/i);
      if (!m) return;
      const colLetters = m[1].toUpperCase();
      let colIdx = 0;
      for (let i = 0; i < colLetters.length; i += 1) {
        colIdx = colIdx * 26 + (colLetters.charCodeAt(i) - 64);
      }
      const rowNum = parseInt(m[2], 10);
      const tableRowIdx = Math.max(0, rowNum - 1);
      const row = tableData.rows[tableRowIdx];
      if (!row || colIdx < 1) return;
      const val = readDataColumnCellFromProcessRow(row, colIdx);
      if (val !== null && val !== "") cellValues.push(val);
    });
    if (cellValues.length === 0 && savedSourceValue && savedSourceValue !== "Source") {
      return { formula: savedSourceValue, source: String(mainTemplate.source_percent ?? "1") };
    }
    if (cellValues.length > 0) {
      let expression = cellValues[0];
      for (let i = 1; i < cellValues.length; i += 1) {
        expression += (operatorsString[i - 1] || "+") + cellValues[i];
      }
      return { formula: expression, source: String(mainTemplate.source_percent ?? "1") };
    }
  }

  const isCompleteExpression = formulaOperatorsValue && /[+\-*/]/.test(formulaOperatorsValue) && /\d/.test(formulaOperatorsValue);
  if (isCompleteExpression && formulaOperatorsValue) {
    return { formula: formulaOperatorsValue, source: String(mainTemplate.source_percent ?? "1") };
  }

  if (savedSourceValue && savedSourceValue !== "Source") {
    return { formula: savedSourceValue, source: String(mainTemplate.source_percent ?? "1") };
  }

  return { formula: "", source: String(mainTemplate.source_percent ?? "1") };
}
