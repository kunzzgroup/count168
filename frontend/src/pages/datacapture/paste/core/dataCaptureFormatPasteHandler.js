import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  plainMatrixToHtmlTable,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
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

/** 2.Format: mat-row plain vertical dump → reshape → HTML table fill. */
export function processFormatPlainMatrix(text, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!text?.trim()) return false;
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
  const normalizedHtml = resolveNormalizedHtml(html);
  if (normalizedHtml && /<table\b/i.test(normalizedHtml)) {
    return processFormatTableHtml(normalizedHtml, options);
  }
  if (text && /<table\b/i.test(text)) {
    return processFormatTableHtml(text, options);
  }
  if (text && text.includes("\t")) {
    return processFormatTsv(text, options);
  }
  if (text?.trim()) {
    return processFormatPlainMatrix(text, options);
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

  const normalizedHtml = resolveNormalizedHtml(html);
  if (normalizedHtml && /<table\b/i.test(normalizedHtml)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(normalizedHtml, options);
    return;
  }

  if (text && /<table\b/i.test(text)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(text, options);
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, options);
    return;
  }

  if (text?.trim() && processFormatPlainMatrix(text, options)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      const normalizedPasted = resolveNormalizedHtml(pastedHTML) || pastedHTML;
      if (normalizedPasted && /<table\b/i.test(normalizedPasted)) {
        const appendStartRow = domGridHasEditableData()
          ? resolveFormatPasteStartRow(getFormatPasteAnchorCell())
          : 0;
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
