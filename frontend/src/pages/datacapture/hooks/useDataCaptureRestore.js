import { useEffect } from "react";
import { dataCaptureRowLabel } from "../utils/dataCaptureRowLabels.js";

function createEditableCell(colIndex) {
  const td = document.createElement("td");
  td.contentEditable = "true";
  td.dataset.col = String(colIndex);
  return td;
}

function restoreTableFromLocalStorage() {
  const raw = localStorage.getItem("capturedTableData");
  if (!raw) return;
  let tableData;
  try {
    tableData = JSON.parse(raw);
  } catch {
    return;
  }
  const tableBody = document.getElementById("tableBody");
  const headerRow = document.querySelector("#tableHeader tr");
  if (!tableBody || !headerRow) return;

  const dataColsFromRows = Array.isArray(tableData?.rows)
    ? tableData.rows.reduce((max, row) => Math.max(max, (Array.isArray(row) ? row.filter((c) => c?.type === "data").length : 0)), 0)
    : 0;
  const targetDataCols = Math.max(1, Number(tableData?.colCount || 0) - 1, dataColsFromRows);
  const targetRows = Math.max(1, Number(tableData?.rowCount || 0), Array.isArray(tableData?.rows) ? tableData.rows.length : 0);

  while (headerRow.querySelectorAll("th").length - 1 < targetDataCols) {
    headerRow.appendChild(document.createElement("th"));
  }

  while (tableBody.children.length < targetRows) {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("td");
    rowHeader.className = "row-header";
    tr.appendChild(rowHeader);
    for (let c = 0; c < targetDataCols; c += 1) {
      tr.appendChild(createEditableCell(c));
    }
    tableBody.appendChild(tr);
  }

  Array.from(tableBody.children).forEach((row, rowIndex) => {
    const rowHeader = row.querySelector(".row-header");
    if (rowHeader) rowHeader.textContent = dataCaptureRowLabel(rowIndex);

    while (row.querySelectorAll("td[data-col]").length < targetDataCols) {
      row.appendChild(createEditableCell(row.querySelectorAll("td[data-col]").length));
    }

    const rowData = Array.isArray(tableData?.rows?.[rowIndex]) ? tableData.rows[rowIndex] : [];
    const dataCells = Array.from(row.querySelectorAll("td[data-col]"));
    dataCells.forEach((cell, colIndex) => {
      cell.dataset.col = String(colIndex);
      const source =
        rowData.find((item) => item?.type === "data" && Number(item.col) === colIndex) ||
        rowData.filter((item) => item?.type === "data")[colIndex];
      cell.textContent = source?.value ? String(source.value) : "";
    });
  });

}

export function useDataCaptureRestore({
  ready,
  processOptions,
  setSelectedDescriptions,
  setSelectedDate,
  setCurrencyId,
  setDataCaptureType,
  setFormatGridReady,
  setRemoveWord,
  setReplaceWordFrom,
  setReplaceWordTo,
  setRemark,
  onRestoreProcess,
}) {
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("restore") !== "1") return;

    try {
      const raw = localStorage.getItem("capturedProcessData");
      if (!raw) return;
      const processData = JSON.parse(raw);

      if (processData?.date) {
        setSelectedDate(processData.date);
      }
      if (processData?.currency != null && String(processData.currency).trim() !== "" && typeof setCurrencyId === "function") {
        setCurrencyId(String(processData.currency));
      }
      try {
        const capType = localStorage.getItem("capturedDataCaptureType");
        if (capType && typeof setDataCaptureType === "function") {
          setDataCaptureType(capType);
        }
      } catch {
        // ignore
      }
      setRemoveWord(processData?.removeWord || "");
      setReplaceWordFrom(processData?.replaceWordFrom || "");
      setReplaceWordTo(processData?.replaceWordTo || "");
      setRemark(processData?.remark || "");

      const descriptions = Array.isArray(processData?.descriptions) ? processData.descriptions : [];
      setSelectedDescriptions(descriptions);

      if (processData?.process) {
        const found =
          processOptions.find((p) => String(p.id) === String(processData.process)) ||
          processOptions.find((p) => String(p.processCode || "").trim() === String(processData.processCode || "").trim());
        if (found && typeof onRestoreProcess === "function") {
          onRestoreProcess(found);
        }
      }
    } catch {
      // ignore malformed restore payload
    }

    restoreTableFromLocalStorage();
    if (typeof setFormatGridReady === "function") {
      const body = document.getElementById("tableBody");
      const hasData = body
        ? Array.from(body.querySelectorAll("td[data-col]")).some((cell) => String(cell.textContent || "").trim() !== "")
        : false;
      setFormatGridReady(hasData);
    }
  }, [
    onRestoreProcess,
    processOptions,
    ready,
    setCurrencyId,
    setDataCaptureType,
    setFormatGridReady,
    setRemark,
    setRemoveWord,
    setReplaceWordFrom,
    setReplaceWordTo,
    setSelectedDate,
    setSelectedDescriptions,
  ]);
}
