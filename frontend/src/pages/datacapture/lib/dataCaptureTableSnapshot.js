import { convertBracketedToNegative } from "./dataCaptureBracket.js";
import { normalizeStoredCaptureType } from "./dataCaptureStorage.js";

function readCellSnapshotText(cell) {
  if (!cell) return "";
  let raw = cell.textContent || cell.innerText || "";
  if (!String(raw).trim() && cell.innerHTML) {
    const tmp = document.createElement("div");
    tmp.innerHTML = cell.innerHTML;
    raw = tmp.textContent || tmp.innerText || "";
  }
  return String(raw);
}

function isHiddenCaptureCell(cell) {
  if (!cell) return true;
  try {
    const style = window.getComputedStyle(cell);
    if (style.display === "none" || style.visibility === "hidden") return true;
  } catch {
    if (cell.style.display === "none") return true;
  }
  return false;
}

function isCaptureGridCell(cell) {
  if (!cell || !cell.closest("#dataTable")) return false;
  if (cell.classList.contains("row-header")) return false;
  const tag = (cell.tagName || "").toLowerCase();
  if (tag !== "td" && tag !== "th") return false;
  if (isHiddenCaptureCell(cell)) return false;
  return readCellSnapshotText(cell).trim() !== "";
}

/** Live DOM check — used when snapshot read and grid disagree (2.Format styled cells). */
export function domGridHasCaptureData() {
  const table = document.getElementById("dataTable");
  if (!table) return false;

  if (Array.from(table.querySelectorAll("tbody td, tbody th")).some(isCaptureGridCell)) {
    return true;
  }

  const tableBody = table.querySelector("tbody");
  if (!tableBody) return false;

  return Array.from(
    tableBody.querySelectorAll("td[contenteditable='true'], td[contenteditable='plaintext-only']"),
  ).some((cell) => !cell.classList.contains("row-header") && readCellSnapshotText(cell).trim() !== "");
}

export function captureTableHasData(tableData) {
  if (tableSnapshotHasData(tableData)) return true;
  return domGridHasCaptureData();
}

/**
 * Reads the Excel grid DOM for submit / restore snapshots.
 */
export function captureTableDataFromDom(captureType) {
  const currentDataCaptureType = normalizeStoredCaptureType(captureType);
  const table = document.getElementById("dataTable");
  const tableData = {
    headers: [],
    rows: [],
    rowCount: 0,
    colCount: 0,
  };

  if (!table) return tableData;

  const headerRow = table.querySelector("thead tr");
  if (headerRow) {
    headerRow.querySelectorAll("th").forEach((header) => {
      tableData.headers.push(header.textContent);
    });
  }

  const tbody = table.querySelector("tbody");
  if (!tbody) return tableData;

  const rows = tbody.querySelectorAll("tr");
  tableData.rowCount = rows.length;

  let maxDataCols = 0;
  const allRowData = [];

  rows.forEach((row, rowIndex) => {
    const rowData = [];
    const cells = row.querySelectorAll("td");

    cells.forEach((cell, colIndex) => {
      if (colIndex === 0) {
        rowData.push({ type: "header", value: cell.textContent });
        return;
      }
      if (isHiddenCaptureCell(cell)) return;

      let cellValue = convertBracketedToNegative(readCellSnapshotText(cell).toUpperCase());
      const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);

      rowData.push({
        type: "data",
        value: cellValue,
        col: colIndex - 1,
        colspan: colspan > 1 ? colspan : undefined,
      });
    });

    if (
      (currentDataCaptureType === "1.Text" ||
        currentDataCaptureType === "2.Format" ||
        currentDataCaptureType === "4.RETURN") &&
      rowData.length > 1
    ) {
      const firstDataCell = rowData[1];
      if (firstDataCell?.type === "data" && (firstDataCell.value || "").trim() === "") {
        for (let i = 2; i < rowData.length; i += 1) {
          const cell = rowData[i];
          if (cell?.type === "data" && (cell.value || "").trim() !== "") {
            const firstValue = firstDataCell.value;
            const targetValue = cell.value;
            firstDataCell.value = targetValue;
            cell.value = firstValue;
            const firstColspan = firstDataCell.colspan;
            const targetColspan = cell.colspan;
            firstDataCell.colspan = targetColspan;
            cell.colspan = firstColspan;
            const firstCol = firstDataCell.col;
            const targetCol = cell.col;
            firstDataCell.col = targetCol;
            cell.col = firstCol;
            break;
          }
        }
      }
    }

    const dataCols = rowData.length - 1;
    if (dataCols > maxDataCols) maxDataCols = dataCols;
    allRowData.push(rowData);
  });

  allRowData.forEach((rowData) => {
    const currentDataCols = rowData.length - 1;
    if (currentDataCols < maxDataCols) {
      for (let i = currentDataCols; i < maxDataCols; i += 1) {
        rowData.push({ type: "data", value: "", col: i });
      }
    }
  });

  tableData.colCount = maxDataCols + 1;

  if (headerRow) {
    const currentHeaderCount = tableData.headers.length;
    if (currentHeaderCount < tableData.colCount) {
      for (let i = currentHeaderCount; i < tableData.colCount; i += 1) {
        tableData.headers.push(i === 0 ? "" : String(i));
      }
    } else if (currentHeaderCount > tableData.colCount) {
      tableData.headers = tableData.headers.slice(0, tableData.colCount);
    }
  }

  tableData.rows = allRowData;
  return tableData;
}

export function tableSnapshotHasData(tableData) {
  if (!tableData?.rows?.length) return false;
  return tableData.rows.some((row) =>
    row.some((cell) => cell.type === "data" && String(cell.value || "").trim() !== "")
  );
}
