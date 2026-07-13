import {
  cellText,
  nonNumericRatio,
  amountDensity,
  dateDensity,
  looksLikeAmountToken,
} from "./utils/tableStats.js";
import { ACCOUNTING_FIELD_ALIASES } from "./mapping/fieldDictionary.js";
import { similarityScore } from "./mapping/stringSimilarity.js";

const ALL_ALIASES = Object.values(ACCOUNTING_FIELD_ALIASES).flat();

function dictionaryMatchScore(row) {
  const cells = (row || []).map(cellText).filter(Boolean);
  if (!cells.length) return 0;
  let bestSum = 0;
  cells.forEach((cell) => {
    let best = 0;
    ALL_ALIASES.forEach((alias) => {
      best = Math.max(best, similarityScore(cell, alias));
    });
    bestSum += best;
  });
  return bestSum / cells.length;
}

function footerScore(row) {
  const joined = (row || []).map(cellText).join(" ").toLowerCase();
  if (/\b(grand\s+)?total\b/.test(joined) || /\bsubtotal\b/.test(joined)) return 80;
  if (/\bsum\b/.test(joined) || /\bbalance\b/.test(joined)) return 60;
  return 0;
}

/**
 * HeaderDetectionEngine — score candidate header rows; classify footer.
 */
export class HeaderDetectionEngine {
  /**
   * @param {{ headers?: string[], rows: string[][], meta?: object }} table
   * @returns {{ headers: string[], rows: string[][], footerRows: string[][], headerScore: number, meta: object }}
   */
  detect(table) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    if (!rows.length) {
      return {
        headers: [],
        rows: [],
        footerRows: [],
        headerScore: 0,
        meta: { ...(table?.meta || {}), headerDetected: false },
      };
    }

    // If caller already supplied headers, keep them
    if (table.headers?.length) {
      return {
        headers: table.headers.map(cellText),
        rows,
        footerRows: [],
        headerScore: 100,
        meta: { ...(table?.meta || {}), headerDetected: true, headerSource: "provided" },
      };
    }

    const sampleData = rows.slice(1, Math.min(rows.length, 12));
    let bestIdx = 0;
    let bestScore = -1;

    const scanLimit = Math.min(rows.length, 5);
    for (let i = 0; i < scanLimit; i += 1) {
      const row = rows[i];
      const below = rows.slice(i + 1, i + 1 + 10);
      let score = nonNumericRatio(row) * 40;
      score += dictionaryMatchScore(row) * 0.35;

      // Data below should look more numeric/date-like than header
      const cols = row.length;
      let densityBoost = 0;
      for (let c = 0; c < cols; c += 1) {
        densityBoost += amountDensity(below, c) * 8 + dateDensity(below, c) * 8;
      }
      score += Math.min(30, densityBoost / Math.max(1, cols));

      // Penalize if this row itself is mostly amounts
      const amtRatio =
        row.filter((c) => looksLikeAmountToken(cellText(c))).length / Math.max(1, row.filter((c) => cellText(c)).length);
      score -= amtRatio * 25;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const HEADER_THRESHOLD = 45;
    let headers = [];
    let dataStart = 0;
    let headerScore = Math.round(bestScore);

    if (bestScore >= HEADER_THRESHOLD) {
      headers = rows[bestIdx].map(cellText);
      dataStart = bestIdx + 1;
    } else {
      // Synthetic empty headers — treat all as data
      headers = rows[0].map((_, i) => `col_${i + 1}`);
      dataStart = 0;
      headerScore = Math.round(bestScore);
    }

    const body = rows.slice(dataStart);
    const footerRows = [];
    while (body.length) {
      const last = body[body.length - 1];
      if (footerScore(last) >= 60) {
        footerRows.unshift(body.pop());
      } else {
        break;
      }
    }

    return {
      headers,
      rows: body,
      footerRows,
      headerScore,
      meta: {
        ...(table?.meta || {}),
        headerDetected: bestScore >= HEADER_THRESHOLD,
        headerRowIndex: bestScore >= HEADER_THRESHOLD ? bestIdx : -1,
        hadSyntheticHeaders: bestScore < HEADER_THRESHOLD,
      },
    };
  }
}

export const headerDetectionEngine = new HeaderDetectionEngine();
