/** Shared row/matrix statistics for cleaning & header detection. */

export function cellText(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "").trim();
  }
  return String(cell ?? "").trim();
}

export function rowNonEmptyCount(row) {
  if (!Array.isArray(row)) return 0;
  return row.filter((c) => cellText(c) !== "").length;
}

export function matrixColumnMode(rows) {
  if (!rows?.length) return 0;
  const counts = new Map();
  rows.forEach((row) => {
    const n = Array.isArray(row) ? row.length : 0;
    if (n > 0) counts.set(n, (counts.get(n) || 0) + 1);
  });
  let best = 0;
  let bestN = 0;
  counts.forEach((freq, cols) => {
    if (freq > best || (freq === best && cols > bestN)) {
      best = freq;
      bestN = cols;
    }
  });
  return bestN;
}

/** Currency / plain number-like (display only; not for money math). */
export function looksLikeAmountToken(text) {
  const s = String(text ?? "").trim();
  if (!s) return false;
  const cleaned = s
    .replace(/^[A-Z]{0,3}\$?\s*/i, "")
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/\s/g, "");
  return /^-?\d+(?:\.\d+)?%?$/.test(cleaned);
}

export function looksLikeDateToken(text) {
  const s = String(text ?? "").trim();
  if (!s) return false;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) return true;
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}/.test(s)) return true;
  return false;
}

export function nonNumericRatio(row) {
  const cells = (row || []).map(cellText).filter(Boolean);
  if (!cells.length) return 1;
  let nonNum = 0;
  cells.forEach((c) => {
    if (!looksLikeAmountToken(c) && !/^-?\d+(\.\d+)?$/.test(c.replace(/,/g, ""))) {
      nonNum += 1;
    }
  });
  return nonNum / cells.length;
}

export function amountDensity(rows, colIndex) {
  if (!rows?.length) return 0;
  let hit = 0;
  let total = 0;
  rows.forEach((row) => {
    const v = cellText(row?.[colIndex]);
    if (!v) return;
    total += 1;
    if (looksLikeAmountToken(v)) hit += 1;
  });
  return total ? hit / total : 0;
}

export function dateDensity(rows, colIndex) {
  if (!rows?.length) return 0;
  let hit = 0;
  let total = 0;
  rows.forEach((row) => {
    const v = cellText(row?.[colIndex]);
    if (!v) return;
    total += 1;
    if (looksLikeDateToken(v)) hit += 1;
  });
  return total ? hit / total : 0;
}
