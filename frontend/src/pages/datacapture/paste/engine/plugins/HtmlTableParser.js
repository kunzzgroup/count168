import { extractMatrixFromHtmlTable } from "../utils/htmlTableExtract.js";

/** Standard HTML <table> parser plugin. */
export const HtmlTableParser = {
  id: "html-table",
  priority: 90,

  /** @param {{ html?: string, plain?: string }} content */
  canParse(content) {
    const html = String(content?.html || "");
    if (!html) return 0;
    if (/<table\b/i.test(html) && /<t[rdh]\b/i.test(html)) return 0.95;
    return 0;
  },

  parse(content) {
    const extracted = extractMatrixFromHtmlTable(content.html);
    if (!extracted?.rows?.length) return null;
    return {
      headers: extracted.headers,
      rows: extracted.rows,
      meta: { ...extracted.meta, parserId: this.id },
    };
  },
};
