import { useCallback } from "react";
import { captureTableDataFromDom, citibetCaptureTableHasData } from "../utils/captureTableDataDom.js";

function convertTableFormatOnSubmit(tableData, dataCaptureType) {
  if (dataCaptureType === "WBET" || dataCaptureType === "WBET_API") return tableData;
  if (!tableData || !Array.isArray(tableData.rows) || tableData.rows.length === 0) return tableData;

  const rows = tableData.rows.map((row) => (Array.isArray(row) ? row.map((cell) => ({ ...cell })) : []));
  const targetIndex = rows.findIndex((row) => {
    const dataCells = row.filter((cell) => cell?.type === "data");
    const first = String(dataCells[0]?.value || "").toUpperCase().trim();
    const second = String(dataCells[1]?.value || "").toUpperCase().trim();
    return (first.includes("SUB TOTAL") || first === "SUB TOTAL") && (second.includes("GRAND TOTAL") || second === "GRAND TOTAL");
  });
  if (targetIndex < 0) return { ...tableData, rows };

  const targetRow = rows[targetIndex];
  const targetDataCells = targetRow.filter((cell) => cell?.type === "data");
  const subValues = ["SUB TOTAL"];
  const grandValues = ["GRAND TOTAL"];
  const thirdText = String(targetDataCells[2]?.value || "").trim();
  if (thirdText) grandValues.push(thirdText.toUpperCase());

  for (let r = targetIndex + 1; r < rows.length; r += 1) {
    const values = rows[r]
      .filter((cell) => cell?.type === "data")
      .map((cell) => String(cell.value || "").trim())
      .filter((v) => v !== "");
    if (values.length !== 2) break;
    const left = values[0];
    const right = values[1];
    if (left.toUpperCase().includes("TOTAL") || right.toUpperCase().includes("TOTAL")) break;
    subValues.push(left.toUpperCase());
    grandValues.push(right.toUpperCase());
  }

  targetDataCells.forEach((cell, idx) => {
    cell.value = idx < subValues.length ? subValues[idx] : "";
  });

  const colCount = targetDataCells.length;
  const grandRow = [
    { type: "header", value: "" },
    ...Array.from({ length: colCount }, (_, idx) => ({
      type: "data",
      value: idx < grandValues.length ? grandValues[idx] : "",
      col: idx,
    })),
  ];
  rows.splice(targetIndex + 1, 0, grandRow);

  rows.forEach((row, idx) => {
    const rowHeader = row.find((cell) => cell?.type === "header");
    if (rowHeader) rowHeader.value = String(idx + 1);
  });

  return { ...tableData, rows, rowCount: rows.length };
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
      tableDataSnapshot,
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
      const sourceTableData = tableDataSnapshot || captureTableDataFromDom();

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
        if (!citibetCaptureTableHasData(sourceTableData)) {
          notify("Please enter data in the table", "danger");
          return;
        }
      }

      const tableData = convertTableFormatOnSubmit(sourceTableData, selectedDataCaptureType);

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
