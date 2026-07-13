/**
 * ClipboardCaptureService — thin wrapper over existing clipboard helpers.
 */
import { getClipboardHtml, getClipboardPlainText } from "../core/dataCaptureClipboard.js";
import { clipboardHtmlLooksLikeGrid } from "../core/dataCaptureFormatClipboardNormalize.js";

/**
 * @typedef {object} CapturedContent
 * @property {string} html
 * @property {string} plain
 * @property {'html'|'plain'} preferred
 * @property {number} capturedAt
 */

export class ClipboardCaptureService {
  /**
   * @param {ClipboardEvent|{ clipboardData?: DataTransfer }} e
   * @returns {CapturedContent}
   */
  capture(e) {
    const html = String(getClipboardHtml(e) || "").trim();
    const plain = String(getClipboardPlainText(e) || "").trim();
    const htmlLooksStructural =
      html.length > 0 &&
      (/<table\b/i.test(html) ||
        clipboardHtmlLooksLikeGrid(html) ||
        /role\s*=\s*["'](?:grid|table|row|cell|gridcell)/i.test(html) ||
        /mat-(?:table|row|cell)/i.test(html));

    const preferred = htmlLooksStructural ? "html" : plain ? "plain" : html ? "html" : "plain";

    return {
      html,
      plain,
      preferred,
      capturedAt: Date.now(),
    };
  }
}

export const clipboardCaptureService = new ClipboardCaptureService();
