import { normalizeClipboardHtmlToTable } from "../../core/dataCaptureFormatClipboardNormalize.js";
import { extractMatrixFromHtmlTable } from "../utils/htmlTableExtract.js";

const MAT_HINT =
  /mat-(?:table|row|cell|header-row|header-cell)|cdk-(?:table|row|cell)/i;

/**
 * Angular Material / CDK clipboard grids.
 * Reuses existing normalizeClipboardHtmlToTable — does not rewrite that pipeline.
 */
export const MaterialCdkParser = {
  id: "material-cdk",
  priority: 85,

  canParse(content) {
    const html = String(content?.html || "");
    if (!html) return 0;
    if (MAT_HINT.test(html)) return 0.92;
    return 0;
  },

  parse(content) {
    const normalized = normalizeClipboardHtmlToTable(content.html) || content.html;
    const extracted = extractMatrixFromHtmlTable(normalized);
    if (!extracted?.rows?.length) return null;
    return {
      headers: extracted.headers,
      rows: extracted.rows,
      meta: { ...extracted.meta, parserId: this.id, normalized: true },
    };
  },
};
