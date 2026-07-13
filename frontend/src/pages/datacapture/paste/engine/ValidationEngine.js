import { cellText, looksLikeDateToken } from "./utils/tableStats.js";
import { isValidMoneyCell, normalizeMoneyCell } from "./utils/moneyParse.js";

/**
 * ValidationEngine — light matrix checks + accounting field checks.
 * Money always via MoneyDecimal helpers.
 */
export class ValidationEngine {
  /**
   * @param {string[][]} matrix
   * @returns {{ ok: boolean, issues: string[], matrix: string[][] }}
   */
  validateMatrix(matrix) {
    const issues = [];
    if (!matrix?.length) {
      return { ok: false, issues: ["EMPTY_MATRIX"], matrix: [] };
    }
    const cols = Math.max(...matrix.map((r) => r.length));
    if (cols < 1) issues.push("NO_COLUMNS");

    const normalized = matrix.map((row) =>
      row.map((cell) => {
        const t = cellText(cell);
        if (isValidMoneyCell(t)) return normalizeMoneyCell(t);
        return t;
      }),
    );

    return { ok: issues.length === 0, issues, matrix: normalized };
  }

  /**
   * @param {Array<Record<string, unknown>>} records
   * @returns {{ ok: boolean, issues: string[], records: Array<Record<string, unknown>> }}
   */
  validateAccountingRecords(records) {
    const issues = [];
    const out = [];
    const seen = new Set();

    (records || []).forEach((rec, idx) => {
      const next = { ...rec };
      if (!cellText(next.document_no) && !cellText(next.description)) {
        issues.push(`ROW_${idx}_MISSING_KEY`);
      }
      if (next.date && !looksLikeDateToken(String(next.date)) && String(next.date).trim()) {
        // keep raw; flag only
        issues.push(`ROW_${idx}_DATE_SUSPECT`);
      }
      ["amount", "tax", "total"].forEach((field) => {
        if (next[field] != null && String(next[field]).trim() !== "") {
          if (!isValidMoneyCell(next[field])) {
            issues.push(`ROW_${idx}_${field.toUpperCase()}_INVALID`);
          } else {
            next[field] = normalizeMoneyCell(next[field]);
          }
        }
      });
      const sig = `${next.document_no}|${next.date}|${next.amount}|${next.total}`;
      if (seen.has(sig)) issues.push(`ROW_${idx}_DUPLICATE`);
      seen.add(sig);
      out.push(next);
    });

    return { ok: !issues.some((i) => /_INVALID|_MISSING_KEY/.test(i)), issues, records: out };
  }
}

export const validationEngine = new ValidationEngine();
