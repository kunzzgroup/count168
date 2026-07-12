import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import { parseAndFillHtmlTableForTextWithFormat } from "./dataCaptureTextHtmlPaste.js";
import { handleTextPlainPaste } from "./dataCaptureTextPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
import {
  getDefaultPasteAnchorCell,
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

function resolveFormatFallbackAnchorCell(startRow = 0, anchorCell = null) {
  if (anchorCell?.closest?.("#dataTable")) return anchorCell;
  const tableBody = document.getElementById("tableBody");
  const targetRow = Math.max(0, Number(startRow) || 0);
  const rowEl = tableBody?.children?.[targetRow];
  const cell = rowEl?.querySelector?.('td[contenteditable="true"]');
  return cell || getDefaultPasteAnchorCell();
}

function processFormatPlainTextFallback(
  text,
  { area = null, startRow = null, anchorCell = null } = {},
) {
  if (!text || !String(text).trim()) return false;
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell || getFormatPasteAnchorCell());
  const resolvedAnchor = resolveFormatFallbackAnchorCell(resolvedStartRow, anchorCell);
  if (!resolvedAnchor) return false;

  const filled = handleTextPlainPaste(null, text, resolvedAnchor);
  return afterFormatPasteFilled(filled, area);
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(html, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!html) return false;
  const normalizedHtml = normalizeClipboardHtmlToTable(html) || html;
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell || getFormatPasteAnchorCell());
  const resolvedAnchor = resolveFormatFallbackAnchorCell(resolvedStartRow, anchorCell);

  const previewFragment = buildFormatPreviewFragmentFromClipboardHtml(normalizedHtml);
  const sanitized = sanitizePastedHTML(normalizedHtml);
  // Prefer richer sources first to preserve class/inline style presentation
  // (e.g. badge-like "MASTER"), then fall back to heavily sanitized HTML.
  const candidates = [previewFragment, normalizedHtml, sanitized].filter(Boolean);
  if (!candidates.length) return false;

  for (const candidate of candidates) {
    const filled = parseAndFillHtmlTableForFormat(candidate, {
      startRow: resolvedStartRow,
    });
    if (afterFormatPasteFilled(filled, area)) return true;
  }

  // Compatibility fallback: some sites copy table-like HTML wrappers that
  // 2.Format structure parser cannot classify. Reuse 1.Text format-preserving
  // parser to keep values/styles and still unlock 2.Format submit flow.
  for (const candidate of candidates) {
    const filledByTextParser = parseAndFillHtmlTableForTextWithFormat(candidate, resolvedAnchor);
    if (afterFormatPasteFilled(filledByTextParser, area)) return true;
  }

  return false;
}

export function processFormatTsv(text, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!text || !text.includes("\t")) return false;
  const tableHtml = tsvToHtmlTable(text);
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

/** Paste handler for #pasteAreaFormat (direct paste into format area). */
export function handleFormatPasteAreaEvent(e) {
  if (!isFormatMode()) return;

  const clipboard = e.clipboardData || window.clipboardData;
  const { html, text } = readClipboard(clipboard);
  const area = document.getElementById("pasteAreaFormat");

  const hasExistingData = domGridHasEditableData();
  const startRow = hasExistingData ? resolveFormatPasteStartRow(getFormatPasteAnchorCell()) : 0;

  if (html && (/<table\b/i.test(html) || clipboardHtmlLooksLikeGrid(html))) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(html, { area, startRow });
    return;
  }

  if (text && /<table\b/i.test(text)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(text, { area, startRow });
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, { area, startRow });
    return;
  }

  if (text && text.trim()) {
    e.preventDefault();
    e.stopPropagation();
    if (processFormatPlainTextFallback(text, { area, startRow })) return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      if (pastedHTML && /<table\b/i.test(pastedHTML)) {
        const appendStartRow = domGridHasEditableData()
          ? resolveFormatPasteStartRow(getFormatPasteAnchorCell())
          : 0;
        processFormatTableHtml(pastedHTML, { area, startRow: appendStartRow });
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

  const hasExistingData = domGridHasEditableData();
  const anchorCell = getFormatPasteAnchorCell();
  const appendMode = hasExistingData;
  const startRow = appendMode ? resolveFormatPasteStartRow(anchorCell) : 0;

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");

  const { html, text } = readClipboard(clipboard);

  if (html && (/<table\b/i.test(html) || clipboardHtmlLooksLikeGrid(html))) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(html, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }

  if (text && text.trim()) {
    e.preventDefault();
    e.stopPropagation();
    processFormatPlainTextFallback(text, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }
}

/** Legacy-compatible entry used by handleFormatPasteFromClipboard. */
export function handleFormatPasteFromClipboard(clipboard, fallbackHTML, options = {}) {
  if (!isFormatMode() || !clipboard) return false;

  const { html, text } = readClipboard(clipboard);
  const htmlCandidate = html || fallbackHTML || "";
  const htmlToUse =
    htmlCandidate && (/<table\b/i.test(htmlCandidate) || clipboardHtmlLooksLikeGrid(htmlCandidate))
      ? htmlCandidate
      : "";

  if (htmlToUse) {
    return processFormatTableHtml(htmlToUse, options);
  }

  if (text && text.includes("\t")) {
    return processFormatTsv(text, options);
  }

  if (text && text.trim()) {
    return processFormatPlainTextFallback(text, options);
  }

  return false;
}

/**
 * Phase 4e: 2.Format grid cell paste — route table HTML/TSV through format pipeline
 * instead of the full legacy paste body.
 */
export function handleFormatCellPaste(e, pastedData) {
  const anchorCell = resolvePasteCell(e.target);
  const startRow = resolveFormatPasteStartRow(anchorCell);

  const clipboard = e.clipboardData || window.clipboardData;
  if (clipboard && handleFormatPasteFromClipboard(clipboard, null, { startRow, anchorCell })) {
    return true;
  }

  const html = (() => {
    try {
      return clipboard?.getData?.("text/html") || "";
    } catch {
      return "";
    }
  })();

  if (html && (/<table\b/i.test(html) || clipboardHtmlLooksLikeGrid(html))) {
    return processFormatTableHtml(html, { startRow, anchorCell });
  }

  if (pastedData && pastedData.includes("\t")) {
    return processFormatTsv(pastedData, { startRow, anchorCell });
  }

  if (pastedData && pastedData.trim()) {
    return processFormatPlainTextFallback(pastedData, { startRow, anchorCell });
  }

  return false;
}
