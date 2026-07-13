import {
  cellText,
  matrixColumnMode,
  rowNonEmptyCount,
  looksLikeAmountToken,
} from "./utils/tableStats.js";

/**
 * Structural overselect cleaning — statistical + generic chrome patterns.
 * No vendor/product name branches.
 */

/** Cross-product report chrome (language-pattern, not site-specific). */
const CHROME_LINE_RE = [
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^showing\s+\d+\s+to\s+\d+\s+of\s+\d+/i,
  /^generated\b/i,
  /^printed\b/i,
  /^confidential\b/i,
  /^copyright\b/i,
  /^all\s+rights\s+reserved\b/i,
  /^\d+\s*\/\s*\d+$/,
];

function rowJoined(row) {
  return (row || []).map(cellText).filter(Boolean).join(" ").trim();
}

function isChromeRow(row) {
  const joined = rowJoined(row);
  if (!joined) return true;
  if (CHROME_LINE_RE.some((re) => re.test(joined))) return true;
  const tokens = (row || []).map(cellText).filter(Boolean);
  if (
    tokens.length <= 6 &&
    tokens.every((t) => /^(showing|entries|to|of|\d{1,4})$/i.test(t.replace(/:$/, "")))
  ) {
    return true;
  }
  return false;
}

function isLikelyTitleRow(row, modeCols) {
  const filled = rowNonEmptyCount(row);
  if (filled === 0) return true;
  // Short row vs modal width → title / section banner
  if (modeCols >= 3 && filled <= Math.max(1, Math.floor(modeCols / 3))) {
    const joined = rowJoined(row);
    if (!looksLikeAmountToken(joined) && joined.length < 80) return true;
  }
  return false;
}

function rowsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (cellText(a[i]).toLowerCase() !== cellText(b[i]).toLowerCase()) return false;
  }
  return true;
}

/**
 * Find largest contiguous block where row width ≈ mode and not chrome.
 * @param {string[][]} rows
 * @returns {string[][]}
 */
function largestStableBlock(rows, modeCols) {
  if (!rows.length) return [];
  let best = [];
  let cur = [];

  const isStable = (row) => {
    if (isChromeRow(row)) return false;
    const n = row.length;
    // Allow 1-col title-like only if mode is 1
    if (modeCols <= 1) return rowNonEmptyCount(row) > 0;
    return n >= Math.max(2, modeCols - 1) || rowNonEmptyCount(row) >= Math.ceil(modeCols * 0.5);
  };

  rows.forEach((row) => {
    if (isStable(row)) {
      cur.push(row);
    } else {
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  });
  if (cur.length > best.length) best = cur;
  return best.length ? best : rows.filter((r) => rowNonEmptyCount(r) > 0 && !isChromeRow(r));
}

export class CleaningEngine {
  /**
   * @param {{ headers?: string[], rows: string[][], meta?: object }} table
   * @returns {{ headers: string[], rows: string[][], meta: object }}
   */
  clean(table) {
    const inputRows = Array.isArray(table?.rows) ? table.rows : [];
    let rows = inputRows
      .map((r) => (Array.isArray(r) ? r.map((c) => cellText(c)) : []))
      .filter((r) => rowNonEmptyCount(r) > 0);

    // Drop obvious chrome everywhere
    rows = rows.filter((r) => !isChromeRow(r));

    const modeCols = matrixColumnMode(rows) || Math.max(0, ...rows.map((r) => r.length));

    // Drop short title-like rows at edges
    while (rows.length && isLikelyTitleRow(rows[0], modeCols)) rows = rows.slice(1);
    while (rows.length && isLikelyTitleRow(rows[rows.length - 1], modeCols)) {
      rows = rows.slice(0, -1);
    }

    rows = largestStableBlock(rows, modeCols);

    // Deduplicate repeated header rows (same as first wide row appearing again)
    if (rows.length >= 2) {
      const first = rows[0];
      const deduped = [first];
      for (let i = 1; i < rows.length; i += 1) {
        if (rowsEqual(rows[i], first) && nonNumericHeavy(first)) continue;
        deduped.push(rows[i]);
      }
      rows = deduped;
    }

    // Pad
    const cols = matrixColumnMode(rows) || Math.max(0, ...rows.map((r) => r.length), 0);
    rows = rows.map((r) => {
      const next = r.slice(0, cols);
      while (next.length < cols) next.push("");
      return next;
    });

    return {
      headers: Array.isArray(table?.headers) ? table.headers : [],
      rows,
      meta: {
        ...(table?.meta || {}),
        cleaned: true,
        modeCols: cols,
        removedChrome: true,
      },
    };
  }
}

function nonNumericHeavy(row) {
  const cells = (row || []).map(cellText).filter(Boolean);
  if (!cells.length) return false;
  const nums = cells.filter((c) => looksLikeAmountToken(c) || /^-?\d+(\.\d+)?$/.test(c.replace(/,/g, "")));
  return nums.length / cells.length < 0.4;
}

export const cleaningEngine = new CleaningEngine();
