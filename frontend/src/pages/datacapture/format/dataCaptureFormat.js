/**
 * 2.Format — preview storage, grid-ready flag, table visibility + style cleanup.
 */
import { renderFormatPreview } from "../paste/core/dataCaptureFormatPreview.js";
import {
  getFormatPasteAnchorCell,
  resolveFormatPasteStartRow,
} from "../paste/core/dataCapturePasteApply.js";
import {
  buildFormatPreviewHtmlFromTableSnapshot,
  captureTableDataFromDom,
  domGridHasEditableData,
} from "../lib/dataCaptureTableSnapshot.js";

export const FORMAT_PREVIEW_HTML_KEY = "capturedFormatPreviewHtml";
export const FORMAT_PREVIEW_HTML_KEY_LEGACY = "captured655PreviewHtml";

/** Whether 2.Format grid has been filled from a paste (legacy `isFormatGridReady`). */
let formatGridReady = false;

export function getFormatGridReady() {
  return formatGridReady;
}

export function setFormatGridReady(value) {
  formatGridReady = !!value;
  window.__DC_ON_FORMAT_GRID_READY__?.(formatGridReady);
}

export function getFormatPreviewHtml() {
  try {
    return (
      localStorage.getItem(FORMAT_PREVIEW_HTML_KEY) ||
      localStorage.getItem(FORMAT_PREVIEW_HTML_KEY_LEGACY) ||
      ""
    );
  } catch {
    return "";
  }
}

export function setFormatPreviewHtml(html) {
  try {
    localStorage.setItem(FORMAT_PREVIEW_HTML_KEY, html ? String(html) : "");
  } catch {
    /* ignore */
  }
}

export function clearFormatPreviewHtml() {
  try {
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY);
    localStorage.removeItem(FORMAT_PREVIEW_HTML_KEY_LEGACY);
  } catch {
    /* ignore */
  }
}

export function clearFormatStyles() {
  const tableBody = document.getElementById("tableBody");
  if (tableBody) {
    tableBody.querySelectorAll("td[contenteditable='true']").forEach((cell) => {
      cell.removeAttribute("style");
      const essentialClasses = ["selected", "multi-selected"];
      Array.from(cell.classList).forEach((cls) => {
        if (!essentialClasses.includes(cls)) {
          cell.classList.remove(cls);
        }
      });
    });
  }

  const tableHeader = document.getElementById("tableHeader");
  if (tableHeader) {
    const headerRow = tableHeader.querySelector("tr");
    if (headerRow) {
      headerRow.querySelectorAll("th").forEach((cell, index) => {
        if (index === 0) return;
        cell.removeAttribute("style");
        const essentialClasses = ["column-selected", "column-active", "row-selected", "row-active"];
        Array.from(cell.classList).forEach((cls) => {
          if (!essentialClasses.includes(cls)) {
            cell.classList.remove(cls);
          }
        });
        const expectedNumber = index;
        const currentText = cell.textContent.trim();
        if (currentText === "") {
          cell.textContent = String(expectedNumber);
          cell.innerHTML = String(expectedNumber);
        }
      });
    }
  }
}

/** Keep preview cache aligned with the live grid (incl. append pastes). */
export function syncFormatPreviewFromDom(captureType = "2.Format") {
  const tableData = captureTableDataFromDom(captureType);
  const html = buildFormatPreviewHtmlFromTableSnapshot(tableData);
  if (!html) return false;
  setFormatPreviewHtml(html);
  if (!getFormatGridReady()) {
    renderFormatPreview(html);
  }
  return true;
}

/** Merge table HTML still in #pasteAreaFormat into the editable grid (append when grid has data). */
function flushPendingFormatPasteArea() {
  const pasteArea = document.getElementById("pasteAreaFormat");
  const pasteHtml = pasteArea?.innerHTML || "";
  if (!pasteHtml || !/<table\b/i.test(pasteHtml)) return false;

  const startRow = domGridHasEditableData()
    ? resolveFormatPasteStartRow(getFormatPasteAnchorCell())
    : 0;

  const processed = window.__DC_PROCESS_FORMAT_HTML__?.(pasteHtml, {
    area: pasteArea,
    startRow,
  });
  return !!processed;
}

function restoreFormatGridFromPreviewHtml(previewHtml) {
  if (!previewHtml) return false;

  if (domGridHasEditableData()) {
    syncFormatPreviewFromDom();
    setFormatGridReady(true);
    return true;
  }

  const filled =
    typeof window.__DC_PARSE_HTML_FORMAT__ === "function"
      ? window.__DC_PARSE_HTML_FORMAT__(previewHtml)
      : false;

  if (filled) {
    renderFormatPreview(previewHtml);
    setFormatGridReady(true);
    return true;
  }

  return false;
}

/** Ensure 2.Format grid is filled and visible before submit snapshot. */
export function prepareFormatSubmitSnapshot(captureType) {
  const type = window.__DC_GET_CAPTURE_TYPE__?.() || captureType || "1.Text";
  if (type !== "2.Format") return true;

  const dataTable = document.getElementById("dataTable");
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const tablePreviewFormat = document.getElementById("tablePreviewFormat");

  if (dataTable) dataTable.style.display = "table";
  if (pasteAreaFormat) pasteAreaFormat.style.display = "none";
  if (tablePreviewFormat) tablePreviewFormat.style.display = "none";

  flushPendingFormatPasteArea();

  if (domGridHasEditableData()) {
    syncFormatPreviewFromDom(type);
    setFormatGridReady(true);
    return true;
  }

  const pasteHtml = pasteAreaFormat?.innerHTML || "";
  if (pasteHtml && /<table\b/i.test(pasteHtml)) {
    const processed = window.__DC_PROCESS_FORMAT_HTML__?.(pasteHtml, { area: pasteAreaFormat });
    if (processed) {
      syncFormatPreviewFromDom(type);
      setFormatGridReady(true);
      return true;
    }
  }

  const previewHtml = getFormatPreviewHtml();
  if (previewHtml) {
    const restored = restoreFormatGridFromPreviewHtml(previewHtml);
    if (restored && domGridHasEditableData()) {
      syncFormatPreviewFromDom(type);
    }
    return restored;
  }

  return false;
}

export function toggleTableDisplayForFormat() {
  const dataTable = document.getElementById("dataTable");
  const tablePreviewFormat = document.getElementById("tablePreviewFormat");
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const captureType = window.__DC_GET_CAPTURE_TYPE__?.() || "1.Text";

  if (captureType === "2.Format") {
    const previewHtml = getFormatPreviewHtml();

    if (previewHtml && !getFormatGridReady() && !domGridHasEditableData()) {
      restoreFormatGridFromPreviewHtml(previewHtml);
    }

    if (getFormatGridReady()) {
      if (dataTable) dataTable.style.display = "table";
      if (pasteAreaFormat) pasteAreaFormat.style.display = "none";
      if (tablePreviewFormat) tablePreviewFormat.style.display = "none";
    } else {
      if (dataTable) dataTable.style.display = "none";
      if (pasteAreaFormat) {
        pasteAreaFormat.style.display = "block";
        pasteAreaFormat.innerHTML = "";
        setTimeout(() => {
          pasteAreaFormat.focus();
        }, 100);
      }
      if (tablePreviewFormat) {
        tablePreviewFormat.style.display = "none";
        tablePreviewFormat.innerHTML = "";
      }
    }
  } else {
    if (dataTable) dataTable.style.display = "table";
    if (pasteAreaFormat) pasteAreaFormat.style.display = "none";
    if (tablePreviewFormat) tablePreviewFormat.style.display = "none";
  }

  window.__DC_ON_FORMAT_GRID_READY__?.(getFormatGridReady());
}
