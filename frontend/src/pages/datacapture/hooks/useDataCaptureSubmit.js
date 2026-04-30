import { useCallback } from "react";
import { captureTableDataFromDom, citibetCaptureTableHasData } from "../utils/captureTableDataDom.js";

function convertTableFormatOnSubmit(dataCaptureType) {
  if (dataCaptureType === "WBET" || dataCaptureType === "WBET_API") return;
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return;

  const rows = Array.from(tableBody.children);
  if (!rows.length) return;

  const targetIndex = rows.findIndex((row) => {
    const first = (row.children[1]?.textContent || "").toUpperCase().trim();
    const second = (row.children[2]?.textContent || "").toUpperCase().trim();
    return (first.includes("SUB TOTAL") || first === "SUB TOTAL") && (second.includes("GRAND TOTAL") || second === "GRAND TOTAL");
  });
  if (targetIndex < 0) return;

  const targetRow = rows[targetIndex];
  const subValues = ["SUB TOTAL"];
  const grandValues = ["GRAND TOTAL"];

  if (targetRow.children.length > 3) {
    const thirdText = String(targetRow.children[3]?.textContent || "").trim();
    if (thirdText) grandValues.push(thirdText.toUpperCase());
  }

  for (let r = targetIndex + 1; r < rows.length; r += 1) {
    const dataCells = Array.from(rows[r].children)
      .slice(1)
      .filter((cell) => cell.contentEditable === "true" && String(cell.textContent || "").trim() !== "");
    if (dataCells.length !== 2) break;

    const left = String(dataCells[0].textContent || "").trim();
    const right = String(dataCells[1].textContent || "").trim();
    if (!left || !right) break;
    if (left.toUpperCase().includes("TOTAL") || right.toUpperCase().includes("TOTAL")) break;

    subValues.push(left.toUpperCase());
    grandValues.push(right.toUpperCase());
  }

  const editableCells = Array.from(targetRow.querySelectorAll("td[contenteditable='true']"));
  editableCells.forEach((cell, idx) => {
    cell.textContent = idx < subValues.length ? subValues[idx] : "";
  });

  const grandRow = document.createElement("tr");
  const rowHeader = document.createElement("td");
  rowHeader.className = "row-header";
  rowHeader.textContent = "";
  grandRow.appendChild(rowHeader);

  const colCount = editableCells.length;
  for (let c = 0; c < colCount; c += 1) {
    const td = document.createElement("td");
    td.contentEditable = "true";
    td.dataset.col = String(c);
    td.textContent = c < grandValues.length ? grandValues[c] : "";
    grandRow.appendChild(td);
  }

  tableBody.insertBefore(grandRow, targetRow.nextSibling);
  Array.from(tableBody.querySelectorAll(".row-header")).forEach((header, idx) => {
    header.textContent = String(idx + 1);
  });
}

export function useDataCaptureSubmit({ selectedDescriptions, navigate }) {
  const notify = useCallback((message, type = "success") => {
    const container = document.getElementById("processNotificationContainer");
    if (!container) return;
    const existing = container.querySelectorAll(".process-notification");
    if (existing.length >= 2) {
      const oldest = existing[0];
      oldest.classList.remove("show");
      setTimeout(() => oldest.remove(), 300);
    }
    const node = document.createElement("div");
    node.className = `process-notification process-notification-${type}`;
    node.textContent = message;
    container.appendChild(node);
    setTimeout(() => node.classList.add("show"), 10);
    setTimeout(() => {
      node.classList.remove("show");
      setTimeout(() => node.remove(), 300);
    }, 1500);
  }, []);

  const submit = useCallback(
    ({
      selectedProcessId,
      selectedProcess,
      currencyId,
      currencyOptions,
      dataCaptureType,
      selectedDate,
      removeWord,
      replaceWordFrom,
      replaceWordTo,
      remark,
    }) => {
      const selectedDataCaptureType = String(dataCaptureType || "").trim();
      const processId = String(selectedProcessId || "").trim();
      const processCode = String(selectedProcess?.processCode || "").trim();
      const processDisplayText = String(selectedProcess?.displayText || "").trim();
      const normalizedCurrencyId = String(currencyId || "").trim();
      const selectedCurrency = Array.isArray(currencyOptions)
        ? currencyOptions.find((currency) => String(currency.id) === normalizedCurrencyId)
        : null;

    const selectedDescriptionsList = Array.isArray(selectedDescriptions) ? selectedDescriptions : [];

    if (!processId) {
      notify("Please select a process", "danger");
      return;
    }
    if (!selectedDescriptionsList.length) {
      notify("Please select at least one description", "danger");
      return;
    }
      if (!normalizedCurrencyId) {
      notify("Please select a currency", "danger");
      return;
    }

    if (selectedDataCaptureType === "CITIBET" || selectedDataCaptureType === "CITIBET_MAJOR") {
      const tableData = captureTableDataFromDom();
      if (!citibetCaptureTableHasData(tableData)) {
        notify("Please enter data in the table", "danger");
        return;
      }
    }

    convertTableFormatOnSubmit(selectedDataCaptureType);

    const processData = {
        date: selectedDate || "",
      process: processId,
      processName: processDisplayText,
      processCode,
      dataCaptureType: selectedDataCaptureType,
      descriptions: selectedDescriptionsList,
        currency: normalizedCurrencyId,
        currencyName: selectedCurrency?.code || "",
        removeWord: removeWord || "",
        replaceWordFrom: replaceWordFrom || "",
        replaceWordTo: replaceWordTo || "",
        remark: remark || "",
    };

    try {
      const tableData = captureTableDataFromDom();
      localStorage.setItem("capturedTableData", JSON.stringify(tableData));
      localStorage.setItem("capturedProcessData", JSON.stringify(processData));
      localStorage.setItem("capturedDataCaptureType", selectedDataCaptureType);

      notify("Data captured successfully! Redirecting to summary...", "success");
      setTimeout(() => {
        navigate("/datacapturesummary?success=1");
      }, 1500);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error submitting data:", error);
      notify("Failed to capture data", "danger");
    }
    },
    [navigate, notify, selectedDescriptions]
  );

  return { submit };
}
