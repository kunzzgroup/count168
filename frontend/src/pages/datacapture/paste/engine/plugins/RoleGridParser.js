import { extractMatrixFromHtmlTable } from "../utils/htmlTableExtract.js";

const ROLE_HINT =
  /role\s*=\s*["'](?:grid|table|row|cell|gridcell|columnheader|rowheader)["']/i;

/** ARIA role-based grid/table parser (structure signals only). */
export const RoleGridParser = {
  id: "role-grid",
  priority: 80,

  canParse(content) {
    const html = String(content?.html || "");
    if (!html || !ROLE_HINT.test(html)) return 0;
    if (/role\s*=\s*["']grid["']/i.test(html) || /role\s*=\s*["']table["']/i.test(html)) {
      return 0.88;
    }
    return 0.7;
  },

  parse(content) {
    if (typeof document === "undefined") return null;
    const root = document.createElement("div");
    root.innerHTML = String(content.html || "");

    const grid =
      root.querySelector('[role="grid"]') ||
      root.querySelector('[role="table"]') ||
      root;

    const rowNodes = Array.from(grid.querySelectorAll('[role="row"]'));
    if (!rowNodes.length) return null;

    const matrix = rowNodes.map((row) => {
      const cells = Array.from(
        row.querySelectorAll(
          '[role="gridcell"], [role="cell"], [role="columnheader"], [role="rowheader"]',
        ),
      );
      return cells.map((c) => String(c.textContent || "").replace(/\s+/g, " ").trim());
    }).filter((r) => r.some((c) => c !== ""));

    if (!matrix.length) {
      // Fallback: some clipboards already converted to table via other paths
      return extractMatrixFromHtmlTable(content.html);
    }

    const maxCols = Math.max(...matrix.map((r) => r.length));
    const rows = matrix.map((r) => {
      const next = r.slice();
      while (next.length < maxCols) next.push("");
      return next;
    });

    return {
      headers: [],
      rows,
      meta: { parserId: this.id, colCount: maxCols, source: "role-grid" },
    };
  },
};
