/**
 * 2.Format — preview storage, grid-ready flag, table visibility + style cleanup.
 */
import {
  cellHasCaptureContent,
  domGridHasCaptureData,
} from "../lib/dataCaptureTableSnapshot.js";
import { renderFormatPreview } from "../paste/core/dataCaptureFormatPreview.js";

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

export function gridHasEditableData() {
  if (domGridHasCaptureData()) return true;
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return false;
  return Array.from(tableBody.querySelectorAll("td")).some((cell) => {
    if (cell.classList.contains("row-header")) return false;
    if (!cell.isContentEditable) return false;
    return cellHasCaptureContent(cell);
  });
}

/** Paste area still holds an HTML table (visible to user but not yet in #tableBody). */
export function pasteAreaHasFormatTable() {
  const area = document.getElementById("pasteAreaFormat");
  if (!area) return false;
  return Array.from(area.querySelectorAll("table td, table th")).some((cell) =>
    cellHasCaptureContent(cell),
  );
}

export function clearFormatPasteViewState() {
  clearFormatPreviewHtml();
  setFormatGridReady(false);
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

export function toggleTableDisplayForFormat() {
  const dataTable = document.getElementById("dataTable");
  const tablePreviewFormat = document.getElementById("tablePreviewFormat");
  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  const captureType = window.__DC_GET_CAPTURE_TYPE__?.() || "1.Text";
  const container = document.querySelector(".excel-table-container");

  if (captureType === "2.Format") {
    const domHasGridData = gridHasEditableData();
    let showGrid = domHasGridData;

    if (showGrid) {
      setFormatGridReady(true);
    } else if (!showGrid && getFormatPreviewHtml() && !pasteAreaHasFormatTable()) {
      clearFormatPasteViewState();
    }

    if (showGrid) {
      if (dataTable) dataTable.style.display = "";
      if (pasteAreaFormat) pasteAreaFormat.style.display = "none";
      if (tablePreviewFormat) tablePreviewFormat.style.display = "none";
      container?.classList.remove("format-paste-mode");
    } else {
      if (dataTable) dataTable.style.display = "none";
      if (pasteAreaFormat) {
        pasteAreaFormat.style.display = "block";
        if (!pasteAreaFormat.textContent?.trim() && !pasteAreaHasFormatTable()) {
          setTimeout(() => {
            pasteAreaFormat.focus();
          }, 100);
        }
      }
      if (tablePreviewFormat) tablePreviewFormat.style.display = "none";
      container?.classList.add("format-paste-mode");
    }
  } else {
    if (dataTable) dataTable.style.display = "table";
    if (pasteAreaFormat) pasteAreaFormat.style.display = "none";
    if (tablePreviewFormat) tablePreviewFormat.style.display = "none";
    container?.classList.remove("format-paste-mode");
  }

  window.__DC_ON_FORMAT_GRID_READY__?.(getFormatGridReady());
}
