import { ACCOUNTING_FIELD_ALIASES, ACCOUNTING_SCHEMA_FIELDS } from "./mapping/fieldDictionary.js";
import { normalizeHeaderLabel, similarityScore } from "./mapping/stringSimilarity.js";
import { cellText, looksLikeAmountToken, looksLikeDateToken } from "./utils/tableStats.js";

/**
 * RuleMappingEngine — dictionary + fuzzy match. No AI.
 */
export class RuleMappingEngine {
  /**
   * @param {string[]} headers
   * @param {string[][]} [sampleRows]
   * @returns {{ mappings: Array<{ field: string, sourceColumn: string, sourceIndex: number, confidence: number }>, overallConfidence: number, source: 'rule' }}
   */
  map(headers, sampleRows = []) {
    const cols = (headers || []).map((h, i) => ({
      index: i,
      label: cellText(h),
      norm: normalizeHeaderLabel(h),
    }));

    /** @type {Map<string, { field: string, sourceColumn: string, sourceIndex: number, confidence: number }>} */
    const usedCols = new Map();
    const mappings = [];

    ACCOUNTING_SCHEMA_FIELDS.forEach((field) => {
      const aliases = ACCOUNTING_FIELD_ALIASES[field] || [];
      let best = null;

      cols.forEach((col) => {
        if (usedCols.has(col.index)) return;
        let score = 0;
        aliases.forEach((alias) => {
          score = Math.max(score, similarityScore(col.label, alias));
        });

        // Sample-shape bonus
        const samples = sampleRows.map((r) => cellText(r?.[col.index])).filter(Boolean);
        if (samples.length) {
          if (field === "date") {
            const ratio = samples.filter(looksLikeDateToken).length / samples.length;
            score = Math.min(100, score + ratio * 15);
          }
          if (field === "amount" || field === "tax" || field === "total") {
            const ratio = samples.filter(looksLikeAmountToken).length / samples.length;
            score = Math.min(100, score + ratio * 15);
          }
        }

        if (!best || score > best.confidence) {
          best = {
            field,
            sourceColumn: col.label || `col_${col.index + 1}`,
            sourceIndex: col.index,
            confidence: Math.round(score),
          };
        }
      });

      if (best && best.confidence >= 40) {
        usedCols.set(best.sourceIndex, best);
        mappings.push(best);
      }
    });

    const overallConfidence = mappings.length
      ? Math.round(mappings.reduce((s, m) => s + m.confidence, 0) / mappings.length)
      : 0;

    return {
      mappings,
      overallConfidence,
      source: "rule",
    };
  }
}

export const ruleMappingEngine = new RuleMappingEngine();
