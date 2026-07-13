/** Excel / Sheets style TSV (tab-separated) plain text. */

function splitLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

export const ExcelTsvParser = {
  id: "excel-tsv",
  priority: 75,

  canParse(content) {
    const plain = String(content?.plain || "");
    if (!plain.trim()) return 0;
    if (!plain.includes("\t")) return 0;
    const lines = splitLines(plain).filter((l) => l.trim() !== "");
    if (!lines.length) return 0;
    const tabLines = lines.filter((l) => l.includes("\t")).length;
    const ratio = tabLines / lines.length;
    if (ratio >= 0.5 && lines.length >= 1) return 0.9;
    if (tabLines >= 1) return 0.6;
    return 0;
  },

  parse(content) {
    const lines = splitLines(content.plain).filter((l) => l.length > 0 || l.includes("\t"));
    const rows = lines.map((line) => line.split("\t").map((c) => c.trim()));
    if (!rows.length) return null;
    const maxCols = Math.max(...rows.map((r) => r.length));
    if (maxCols < 1) return null;
    const padded = rows.map((r) => {
      const next = r.slice();
      while (next.length < maxCols) next.push("");
      return next;
    });
    return {
      headers: [],
      rows: padded,
      meta: { parserId: this.id, colCount: maxCols, source: "tsv" },
    };
  },
};
