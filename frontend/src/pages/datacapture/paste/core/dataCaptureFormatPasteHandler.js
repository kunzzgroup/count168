import { parseAndFillHtmlTableForFormat } from "./dataCaptureFormatHtmlPaste.js";
import {
  buildFormatPreviewFragmentFromClipboardHtml,
  clipboardLooksLikeTable,
  renderFormatPreview,
  sanitizePastedHTML,
  tsvToHtmlTable,
} from "./dataCaptureFormatPreview.js";
import {
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
} from "./dataCapturePasteApply.js";
import { domGridHasEditableData } from "../../lib/dataCaptureTableSnapshot.js";
import { getFormatGridReady, syncFormatPreviewFromDom } from "../../format/dataCaptureFormat.js";
import { resolvePasteCell } from "./dataCaptureClipboard.js";

function getCaptureType() {
  if (typeof window.__DC_GET_CAPTURE_TYPE__ === "function") {
    return window.__DC_GET_CAPTURE_TYPE__() || "1.Text";
  }
  return "1.Text";
}

function isFormatMode() {
  return getCaptureType() === "2.Format";
}

function isEditableFormField(el) {
  if (!el) return false;
  if (el.closest("#dataTable")) return false;
  if (el.id === "pasteAreaFormat") return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function placeCaretAtEnd(el) {
  try {
    el.focus();
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    /* ignore */
  }
}

function markFormatGridReady(ready) {
  window.__DC_SET_FORMAT_GRID_READY__?.(ready);
}

function afterFormatPasteFilled(filled, area) {
  if (!filled) return false;
  markFormatGridReady(true);
  syncFormatPreviewFromDom();
  if (area) area.innerHTML = "";
  window.__DC_TOGGLE_FORMAT_DISPLAY__?.();
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
  return true;
}

/** Process HTML/TSV clipboard content into preview + editable grid. */
export function processFormatTableHtml(html, { area = null, startRow = null, anchorCell = null } = {}) {
  if (!html) return false;
  const resolvedStartRow =
    startRow != null ? startRow : resolveFormatPasteStartRow(anchorCell || getFormatPasteAnchorCell());
  const isAppend = resolvedStartRow > 0;

  const previewFragment = buildFormatPreviewFragmentFromClipboardHtml(html);
  const sanitized = sanitizePastedHTML(html);
  if (!previewFragment && !sanitized) return false;

  if (!isAppend) {
    renderFormatPreview(previewFragment || sanitized);
  }
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

  if (html && /<table\b/i.test(html)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(html, { area });
    return;
  }

  if (text && /<table\b/i.test(text)) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTableHtml(text, { area });
    return;
  }

  if (text && text.includes("\t")) {
    e.preventDefault();
    e.stopPropagation();
    processFormatTsv(text, { area });
    return;
  }

  setTimeout(() => {
    try {
      const pastedHTML = area?.innerHTML || "";
      if (pastedHTML && /<table\b/i.test(pastedHTML)) {
        processFormatTableHtml(pastedHTML, { area });
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

  const clipboard = e.clipboardData || window.clipboardData;
  if (!clipboard || !clipboardLooksLikeTable(clipboard)) return;

  e.preventDefault();
  e.stopPropagation();

  const gridReady = getFormatGridReady();
  const hasExistingData = domGridHasEditableData();
  const anchorCell = getFormatPasteAnchorCell();
  const appendMode = gridReady && hasExistingData;
  const startRow = appendMode ? resolveFormatPasteStartRow(anchorCell) : 0;

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const dataTable = document.getElementById("dataTable");

  if (appendMode) {
    if (dataTable) dataTable.style.display = "table";
    if (pasteAreaFormat) pasteAreaFormat.style.display = "none";
  } else {
    if (dataTable) dataTable.style.display = "none";
    if (pasteAreaFormat) {
      pasteAreaFormat.style.display = "block";
      placeCaretAtEnd(pasteAreaFormat);
    }
  }

  const { html, text } = readClipboard(clipboard);

  if (html && /<table\b/i.test(html)) {
    processFormatTableHtml(html, { area: pasteAreaFormat, startRow, anchorCell });
    return;
  }

  if (text && text.includes("\t")) {
    processFormatTsv(text, { area: pasteAreaFormat, startRow, anchorCell });
  }
}

/** Legacy-compatible entry used by handleFormatPasteFromClipboard. */
export function handleFormatPasteFromClipboard(clipboard, fallbackHTML, options = {}) {
  if (!isFormatMode() || !clipboard) return false;

  const { html, text } = readClipboard(clipboard);
  const htmlToUse = html && /<table\b/i.test(html) ? html : fallbackHTML || "";

  if (htmlToUse && /<table\b/i.test(htmlToUse)) {
    setTimeout(() => processFormatTableHtml(htmlToUse, options), 10);
    return true;
  }

  if (text && text.includes("\t")) {
    setTimeout(() => processFormatTsv(text, options), 10);
    return true;
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

  if (html && /<table\b/i.test(html)) {
    return processFormatTableHtml(html, { startRow, anchorCell });
  }

  if (pastedData && pastedData.includes("\t")) {
    return processFormatTsv(pastedData, { startRow, anchorCell });
  }

  return false;
}
