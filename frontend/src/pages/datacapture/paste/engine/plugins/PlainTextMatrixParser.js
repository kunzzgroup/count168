import { looksLikeAmountToken } from "../utils/tableStats.js";

/**
 * Plain / mixed text matrix (space-aligned or newline dumps).
 * Lower priority than TSV; overselect-friendly raw rows for CleaningEngine.
 */

function splitLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd());
}

function splitRow(line) {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (line.includes("|")) {
    return line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[i] === ""));
  }
  // Multi-space columns
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  return [line.trim()];
}

export const PlainTextMatrixParser = {
  id: "plain-text-matrix",
  priority: 40,

  canParse(content) {
    const plain = String(content?.plain || "").trim();
    if (!plain) return 0;
    if (plain.includes("\t")) return 0.25; // prefer ExcelTsvParser
    const lines = splitLines(plain).filter((l) => l.trim() !== "");
    if (lines.length < 2) return 0.15;
    const multiCol = lines.filter((l) => splitRow(l).length >= 2).length;
    const amountish = lines.filter((l) => looksLikeAmountToken(l) || /\$/.test(l)).length;
    if (multiCol / lines.length >= 0.4) return 0.72;
    // Vertical dump (one token per line) — still parseable after cleaning reshape hints
    if (lines.length >= 4 && amountish >= 2) return 0.55;
    if (lines.length >= 2) return 0.4;
    return 0;
  },

  parse(content) {
    const lines = splitLines(content.plain).filter((l) => l.trim() !== "");
    if (!lines.length) return null;
    const rows = lines.map((line) => splitRow(line));
    const maxCols = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => {
      const next = r.slice();
      while (next.length < maxCols) next.push("");
      return next;
    });
    return {
      headers: [],
      rows: padded,
      meta: { parserId: this.id, colCount: maxCols, source: "plain" },
    };
  },
};
