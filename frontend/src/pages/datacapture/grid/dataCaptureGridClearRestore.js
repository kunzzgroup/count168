/**
 * Reset / restore grid snapshot.
 */
import { clearAllSelections } from "./dataCaptureGridSelection.js";
import {
  clearFormatPreviewHtml,
  clearFormatStyles,
  setFormatGridReady,
  setFormatPreviewHtml,
  showFormatEditableGrid,
  showFormatPasteArea,
  toggleTableDisplayForFormat,
} from "../format/dataCaptureFormat.js";
import { normalizeCaptureType } from "../lib/dataCaptureFormRules.js";
import { resolveDataCaptureGridDimensions } from "./dataCaptureGridMeta.js";
import {
  buildFormatPreviewHtmlFromTableSnapshot,
  tableSnapshotHasData,
} from "../lib/dataCaptureTableSnapshot.js";
import { callDataCaptureRuntime, getDataCaptureState } from "../lib/dataCaptureRuntime.js";

function activeGridDimensions() {
  return resolveDataCaptureGridDimensions(getDataCaptureState().isGroupOnlyGrid === true);
}

function rebuildDefaultColumnHeaders(headerRow, cols) {
  headerRow.innerHTML = "<th></th>";
  for (let j = 0; j < cols; j += 1) {
    const header = document.createElement("th");
    header.textContent = String(j + 1);
    callDataCaptureRuntime("attachColumnHeader", header);
    headerRow.appendChild(header);
  }
}

/** Format / header chrome reset without clearing tbody cell values. */
export function clearCaptureTableUiAfterGridClear() {
  const tableHeader = document.getElementById("tableHeader");
  if (tableHeader) {
    const headerRow = tableHeader.querySelector("tr");
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll("th");
      const currentCols = headerCells.length - 1;

      headerCells.forEach((cell, index) => {
        if (index === 0) return;
        cell.removeAttribute("style");
        const essentialClasses = ["column-selected", "column-active"];
        Array.from(cell.classList).forEach((cls) => {
          if (!essentialClasses.includes(cls)) {
            cell.classList.remove(cls);
          }
        });
        cell.textContent = String(index);
        cell.innerHTML = String(index);
      });

      if (currentCols === 0) {
        rebuildDefaultColumnHeaders(headerRow, activeGridDimensions().cols);
      }
    }
  }

  clearFormatStyles();

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  if (pasteAreaFormat) {
    pasteAreaFormat.innerHTML = "";
  }

  const tablePreviewFormat = document.getElementById("tablePreviewFormat");
  if (tablePreviewFormat) {
    tablePreviewFormat.style.display = "none";
  }

<<<<<<< HEAD
  const captureType = window.__DC_GET_CAPTURE_TYPE__?.() || "1.Text";
=======
  showFormatEditableGrid();

  const captureType = callDataCaptureRuntime("getCaptureType") || "1.Text";
>>>>>>> a889492a0 (274(datacapture pg to react + vite non-legacy))
  if (captureType === "2.Format") {
    clearFormatPreviewHtml();
  }

  setFormatGridReady(false);

  if (captureType === "2.Format") {
    showFormatPasteArea();
  } else {
    showFormatEditableGrid();
  }
  clearAllSelections();
}

export async function restoreCaptureTableFromData(tableData, savedType) {
  const type = normalizeCaptureType(savedType || "1.Text") || "1.Text";

  if (!tableData?.rows?.length) {
    callDataCaptureRuntime("applyCaptureType", type);
    const { rows, cols } = activeGridDimensions();
    callDataCaptureRuntime("ensureGridReady", rows, cols);
    return;
  }

  const requiredRows = tableData.rowCount || tableData.rows.length;
  const requiredCols = Math.max(
    tableData.colCount || (tableData.headers ? tableData.headers.length - 1 : 15),
    15,
  );

  callDataCaptureRuntime("ensureGridReady", requiredRows, requiredCols);

  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });

  callDataCaptureRuntime("populateGridFromSnapshot", tableData);

  const hasData = tableSnapshotHasData(tableData);
  if (hasData) {
    setFormatGridReady(true);
    try {
      const html = buildFormatPreviewHtmlFromTableSnapshot(tableData);
      if (html) {
        setFormatPreviewHtml(html);
      }
      showFormatEditableGrid();
    } catch {
      /* ignore */
    }
  } else {
    setFormatGridReady(false);
    clearFormatPreviewHtml();
  }

  callDataCaptureRuntime("applyCaptureType", type);

  const captureType = callDataCaptureRuntime("getCaptureType") || type;
  if (captureType === "2.Format") {
    setTimeout(() => {
      toggleTableDisplayForFormat();
    }, 100);
  }
}
