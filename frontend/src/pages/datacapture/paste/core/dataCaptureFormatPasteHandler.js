import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  plainMatrixToHtmlTable,
  plainMatrixToStyledHtmlTable,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
import { parseFormatHtmlTableStructure } from "./dataCaptureFormatHtmlMatrix.js";
import { parsePlainTextMatrix } from "./dataCaptureTextPaste.js";
import {
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
} from "./dataCapturePasteApply.js";
import { domGridHasEditableData } from "../../lib/dataCaptureTableSnapshot.js";
import { isGridPasteBlockedTarget } from "./dataCaptureClipboard.js";
import { showFormatEditableGrid, syncFormatPreviewFromDom } from "../../format/dataCaptureFormat.js";
import { resolvePasteCell } from "./dataCaptureClipboard.js";
import {
  getActiveCaptureType,
  recomputeSubmitStateAfterPaste,
  setFormatGridReady,
  toggleFormatDisplay,
} from "../../lib/dataCaptureBridge.js";

function isFormatMode() {
  return getActiveCaptureType() === "2.Format";
}

function isEditableFormField(el) {
  return isGridPasteBlockedTarget(el);
}

function afterFormatPasteFilled(filled, area) {
  if (!filled) return false;
  setFormatGridReady(true);
  syncFormatPreviewFromDom();
  if (area) area.innerHTML = "";
  showFormatEditableGrid();
  toggleFormatDisplay();
  recomputeSubmitStateAfterPaste();
  return true;
}

function resolveNormalizedHtml(html) {
  if (!html) return "";
  if (/<table\b/i.test(html)) {
    return normalizeClipboardHtmlToTable(html) || html;
  }
  if (clipboardHtmlLooksLikeGrid(html)) {
    return normalizeClipboardHtmlToTable(html) || "";
  }
  return "";
}

function matrixLooksMultiColumn(matrix) {
  if (!matrix?.length) return false;
  const cols = matrix[0]?.length || 0;
  return cols >= 2 && matrix.some((row) => (row?.length || 0) >= 2);
}

/**
 * When text/plain is empty or already crushed to N×1, rebuild a field dump from
 * Material / table cells so Format dual-source can reshape.
 */
export function extractPlainFieldDumpFromHtml(html) {
  if (!html) return "";
  try {
    const root = document.createElement("div");
    root.innerHTML = String(html);
    const cells = root.querySelectorAll(
      [
        "mat-cell",
        "mat-footer-cell",
        "mat-header-cell",
        ".mat-cell",
        ".mat-footer-cell",
        ".mat-header-cell",
        '[role="gridcell"]',
        "td",
        "th",
      ].join(", "),
    );
    const tokens = [];
    cells.forEach((cell) => {
      const text = String(cell.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) tokens.push(text);
    });
    if (tokens.length >= 3) return tokens.join("\n");

    // Fallback: newline-split text content (paste-area / collapsed copies).
    const raw = String(root.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length >= 3 ? lines.join("\n") : "";
  } catch {
    return "";
  }
}

function resolveFormatPlainText(html, text) {
  const direct = String(text ?? "");
  const directMatrix = direct.trim() ? parsePlainTextMatrix(direct) : null;
  if (matrixLooksMultiColumn(directMatrix)) return direct;

  const fromHtml = extractPlainFieldDumpFromHtml(html);
  if (!fromHtml) return direct;
  const htmlMatrix = parsePlainTextMatrix(fromHtml);
  if (matrixLooksMultiColumn(htmlMatrix)) return fromHtml;
  return direct || fromHtml;
}

/**
 * True when Format HTML is a vertical field dump (one logical field per row),
 * including "fake-wide" tables where only the first cell is filled and the rest
 * are empty padding columns (Chrome Material clipboard failure mode).
 */
export function formatHtmlLooksLikeVerticalNx1(html) {
  if (!html || !/<table\b/i.test(html)) return false;
  try {
    const structure = parseFormatHtmlTableStructure(html);
    if (!structure) return true;
    const { dataRows, maxCols } = structure;
    if (!dataRows?.length) return maxCols <= 1;

    let singleFilledRows = 0;
    const tokens = [];
    dataRows.forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td, th"));
      const filled = cells.filter((cell) => {
        const text = String(cell.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return Boolean(text);
      });
      if (filled.length === 1) {
        singleFilledRows += 1;
        tokens.push(
          String(filled[0].textContent || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        );
      }
    });

    // Fake-wide N×1: many rows, each with only one non-empty cell (padding TDs).
    if (
      dataRows.length >= 3 &&
      singleFilledRows >= Math.max(3, Math.ceil(dataRows.length * 0.75))
    ) {
      const moneyLike = tokens.filter((token) =>
        /^\$?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\$?-?\d+(?:\.\d+)?$/.test(token),
      ).length;
      if (moneyLike >= 2) return true;
      if (tokens.some((token) => /^(?:SUB\s*TOTAL|SUBTOTAL|TOTAL\s*AMOUNT|TOTAL)$/i.test(token))) {
        return true;
      }
    }

    if (maxCols >= 2) return false;
    return dataRows.length >= 3 || maxCols <= 1;
  } catch {
    return false;
  }
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(html, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!html) return false;
  const normalizedHtml = resolveNormalizedHtml(html) || html;
  if (!/<table\b/i.test(normalizedHtml)) return false;

  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell || getFormatPasteAnchorCell());

  const previewFragment = buildFormatPreviewFragmentFromClipboardHtml(normalizedHtml);
  const sanitized = sanitizePastedHTML(normalizedHtml);
  if (!previewFragment && !sanitized) return false;

  const filled = parseAndFillHtmlTableForFormat(sanitized || previewFragment, {
    startRow: resolvedStartRow,
  });
  return afterFormatPasteFilled(filled, area);
}

export function processFormatTsv(text, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!text || !text.includes("\t")) return false;
  const tableHtml = tsvToHtmlTable(text);
  return processFormatTableHtml(tableHtml, { area, startRow, anchorCell });
}

/**
 * 2.Format dual-source: plain matrix owns structure; HTML supplies .positive / link colors.
 * Format-only — does not touch 1.TEXT handlers.
 */
export function processFormatDualSource(html, text, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!text?.trim()) return false;
  const matrix = parsePlainTextMatrix(text);
  if (!matrixLooksMultiColumn(matrix)) return false;
  const tableHtml = plainMatrixToStyledHtmlTable(matrix, html || "") || plainMatrixToHtmlTable(matrix);
  return processFormatTableHtml(tableHtml, { area, startRow, anchorCell });
}

/** 2.Format: mat-row plain vertical dump → reshape → HTML table fill. */
export function processFormatPlainMatrix(text, { area = null, startRow = null, anchorCell = null, html = "" } = {}) {
  if (!text?.trim()) return false;
  if (html) return processFormatDualSource(html, text, { area, startRow, anchorCell });
  const matrix = parsePlainTextMatrix(text);
  if (!matrixLooksMultiColumn(matrix)) return false;
  const tableHtml = plainMatrixToHtmlTable(matrix);
  return processFormatTableHtml(tableHtml, { area, startRow, anchorCell });
}

function readClipboard(clipboard) {
  const getData = (type) => {
    try {
      return clipboard?.getData?.(type) || "";
    } catch {
      return "";
    }
  };
  return {
    html: getData("text/html"),
    text: getData("text/plain"),
  };
}

function tryProcessFormatClipboard(html, text, options) {
  const plainText = resolveFormatPlainText(html, text);
  const plainMatrix = plainText?.trim() ? parsePlainTextMatrix(plainText) : null;
  const plainMulti = matrixLooksMultiColumn(plainMatrix);

  // Prefer good multi-col HTML (keeps mat-row styles). Reject N×1 / fake-wide dumps.
  const normalizedHtml = resolveNormalizedHtml(html);
  if (normalizedHtml && /<table\b/i.test(normalizedHtml)) {
    const isVerticalDump = formatHtmlLooksLikeVerticalNx1(normalizedHtml);
    if (!isVerticalDump) {
      return processFormatTableHtml(normalizedHtml, options);
    }
    // Reshape via plain matrix; HTML only supplies style hints.
    if (plainMulti) {
      return processFormatDualSource(html || normalizedHtml, plainText, options);
    }
  }

  if (html && clipboardHtmlLooksLikeGrid(html)) {
    const forced = normalizeClipboardHtmlToTable(html);
    if (forced && /<table\b/i.test(forced)) {
      const isVerticalDump = formatHtmlLooksLikeVerticalNx1(forced);
      if (!isVerticalDump) {
        return processFormatTableHtml(forced, options);
      }
      if (plainMulti) {
        return processFormatDualSource(html, plainText, options);
      }
    }
  }

  // Grid-like HTML + reshapable plain, but normalize failed → still dual-source.
  if (html && clipboardHtmlLooksLikeGrid(html) && plainMulti) {
    return processFormatDualSource(html, plainText, options);
  }

  if (plainText && /<table\b/i.test(plainText)) {
    if (!formatHtmlLooksLikeVerticalNx1(plainText)) {
      return processFormatTableHtml(plainText, options);
    }
    if (plainMulti) return processFormatDualSource(html, plainText, options);
  }
  if (plainText && plainText.includes("\t")) {
    return processFormatTsv(plainText, options);
  }
  if (plainMulti) {
    return processFormatDualSource(html, plainText, options);
  }
  if (plainText?.trim()) {
    return processFormatPlainMatrix(plainText, { ...options, html: html || "" });
  }
  return false;
}

/** Paste handler for #pasteAreaFormat (direct paste into format area). */
export function handleFormatPasteAreaEvent(e) {
  if (!isFormatMode()) return;

  const clipboard = e.clipboardData || window.clipboardData;
  const { html, text } = readClipboard(clipboard);
  const area = document.getElementById("pasteAreaFormat");

  const hasExistingData = domGridHasEditableData();
  const startRow = hasExistingData ? resolveFormatPasteStartRow(getFormatPasteAnchorCell()) : 0;
  const options = { area, startRow };

  if (tryProcessFormatClipboard(html, text, options)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Still intercept Material / report pastes so the browser does not dump N×1 into the area.
  if ((html && clipboardHtmlLooksLikeGrid(html)) || resolveFormatPlainText(html, text).includes("\n")) {
    e.preventDefault();
    e.stopPropagation();
    const recovered = resolveFormatPlainText(html, text);
    if (recovered?.trim() && processFormatDualSource(html, recovered, options)) return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      const normalizedPasted = resolveNormalizedHtml(pastedHTML) || pastedHTML;
      if (normalizedPasted && /<table\b/i.test(normalizedPasted)) {
        const appendStartRow = domGridHasEditableData()
          ? resolveFormatPasteStartRow(getFormatPasteAnchorCell())
          : 0;
        if (formatHtmlLooksLikeVerticalNx1(normalizedPasted)) {
          const recovered = resolveFormatPlainText(pastedHTML, text);
          if (recovered?.trim() && processFormatDualSource(pastedHTML, recovered, { area, startRow: appendStartRow })) {
            return;
          }
        }
        processFormatTableHtml(normalizedPasted, { area, startRow: appendStartRow });
      }
    } catch {
      /* ignore */
    }
  }, 0);
}

/**
 * Global bubble-phase intercept: route table paste to format pipeline
 * instead of letting <table> land elsewhere on the page.
 */
export function handleGlobalFormatPaste(e) {
  if (!isFormatMode()) return;
  if (isEditableFormField(e.target)) return;
  if (e.target?.closest?.("#dataTable")) return;
  if (e.defaultPrevented) return;

  const clipboard = e.clipboardData || window.clipboardData;
  if (!clipboard || !clipboardLooksLikeTable(clipboard)) return;

  e.preventDefault();
  e.stopPropagation();

  const hasExistingData = domGridHasEditableData();
  const anchorCell = getFormatPasteAnchorCell();
  const startRow = hasExistingData ? resolveFormatPasteStartRow(anchorCell) : 0;
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const { html, text } = readClipboard(clipboard);

  tryProcessFormatClipboard(html, text, {
    area: pasteAreaFormat,
    startRow,
    anchorCell,
  });
}

/** Legacy-compatible entry used by handleFormatPasteFromClipboard. */
export function handleFormatPasteFromClipboard(clipboard, fallbackHTML, options = {}) {
  if (!isFormatMode() || !clipboard) return false;

  const { html, text } = readClipboard(clipboard);
  const htmlCandidate = html || fallbackHTML || "";

  if (tryProcessFormatClipboard(htmlCandidate, text, options)) {
    return true;
  }
  return false;
}

/**
 * Phase 4e: 2.Format grid cell paste — route table HTML/TSV/mat-row through format pipeline.
 */
export function handleFormatCellPaste(e, pastedData) {
  const anchorCell = resolvePasteCell(e.target);
  const startRow = resolveFormatPasteStartRow(anchorCell);
  const options = { startRow, anchorCell };

  const clipboard = e.clipboardData || window.clipboardData;
  if (clipboard && handleFormatPasteFromClipboard(clipboard, null, options)) {
    return true;
  }

  const html = (() => {
    try {
      return clipboard?.getData?.("text/html") || "";
    } catch {
      return "";
    }
  })();

  return tryProcessFormatClipboard(html, pastedData, options);
}
