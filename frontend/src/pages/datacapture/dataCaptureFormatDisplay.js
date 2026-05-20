/**
 * 2.Format table visibility + style cleanup — extracted from js/datacapture.js (Phase 5g).
 */
import { getFormatPreviewHtml } from "./dataCaptureFormatStorage.js";
import { getFormatGridReady, setFormatGridReady } from "./dataCaptureFormatGridState.js";
import { renderFormatPreview } from "./paste/dataCaptureFormatPreview.js";

export { getFormatGridReady, setFormatGridReady };

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

  if (captureType === "2.Format") {
    let previewHtml = getFormatPreviewHtml();

    if (previewHtml && !getFormatGridReady()) {
      renderFormatPreview(previewHtml);
      setFormatGridReady(true);
    }

    if (getFormatGridReady() || previewHtml) {
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
