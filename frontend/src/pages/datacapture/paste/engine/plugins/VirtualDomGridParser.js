import { normalizeClipboardHtmlToTable } from "../../core/dataCaptureFormatClipboardNormalize.js";
import { extractMatrixFromHtmlTable } from "../utils/htmlTableExtract.js";

/**
 * Generic virtual-DOM grid heuristic (row shell + cell shell density).
 * Brand-agnostic: no if(agGrid)/if(kendo) — only structural class/role patterns.
 */
const ROW_SHELL_RE =
  /(?:^|[\s"'])(?:[\w-]*-)?(?:row|data-row|table-row)(?:[\s"']|$)/i;
const CELL_SHELL_RE =
  /(?:^|[\s"'])(?:[\w-]*-)?(?:cell|data-cell|gridcell|table-cell)(?:[\s"']|$)/i;

function countStructuralHits(html) {
  const rowHits = (html.match(new RegExp(ROW_SHELL_RE.source, "gi")) || []).length;
  const cellHits = (html.match(new RegExp(CELL_SHELL_RE.source, "gi")) || []).length;
  return { rowHits, cellHits };
}

export const VirtualDomGridParser = {
  id: "virtual-dom-grid",
  priority: 70,

  canParse(content) {
    const html = String(content?.html || "");
    if (!html || html.length < 40) return 0;
    if (/<table\b/i.test(html)) return 0.2; // prefer HtmlTableParser
    const { rowHits, cellHits } = countStructuralHits(html);
    if (rowHits >= 2 && cellHits >= 4) return Math.min(0.86, 0.55 + rowHits * 0.02 + cellHits * 0.01);
    if (rowHits >= 1 && cellHits >= 2) return 0.45;
    return 0;
  },

  parse(content) {
    // Reuse normalize path: it already collects mat/role/cdk row shells generically.
    const normalized = normalizeClipboardHtmlToTable(content.html) || content.html;
    const extracted = extractMatrixFromHtmlTable(normalized);
    if (extracted?.rows?.length) {
      return {
        headers: extracted.headers,
        rows: extracted.rows,
        meta: { ...extracted.meta, parserId: this.id },
      };
    }
    return null;
  },
};
