import { useCallback } from "react";

function getProcessId(buttonElement) {
  if (!buttonElement) return "";
  return buttonElement.getAttribute("data-value") || "";
}

function convertBracketedToNegative(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  const bracketMatch = trimmed.match(/^\(([^)]+)\)$/);
  if (!bracketMatch) return trimmed;
  return `-${bracketMatch[1].trim()}`;
}

function captureTableData() {
  const table = document.getElementById("dataTable");
  if (!table) return { headers: [], rows: [], rowCount: 0, colCount: 0 };

  const headerRow = table.querySelector("thead tr");
  const headers = headerRow ? Array.from(headerRow.querySelectorAll("th")).map((th) => th.textContent || "") : [];
  const rows = Array.from(table.querySelectorAll("tbody tr")).map((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    const mapped = [];
    cells.forEach((cell, index) => {
      if (index === 0) {
        mapped.push({ type: "header", value: cell.textContent || "" });
        return;
      }
      if (cell.style.display === "none") return;
      const colspan = Number(cell.getAttribute("colspan") || "1");
      mapped.push({
        type: "data",
        value: convertBracketedToNegative(String(cell.textContent || "").toUpperCase()),
        col: index - 1,
        ...(colspan > 1 ? { colspan } : {}),
      });
    });
    return mapped;
  });
  const maxDataCols = rows.reduce((max, row) => Math.max(max, row.filter((c) => c.type === "data").length), 0);
  return {
    headers,
    rows,
    rowCount: rows.length,
    colCount: Math.max(maxDataCols + 1, headers.length),
  };
}

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

  const submit = useCallback(() => {
    const processInput = document.getElementById("capture_process");
    const currencySelect = document.getElementById("capture_currency");
    const typeSelect = document.getElementById("dataCaptureTypeSelector");
    const selectedDataCaptureType = typeSelect ? String(typeSelect.value || "").trim() : "";
    const selectedDescriptionsList = Array.isArray(selectedDescriptions) ? selectedDescriptions : [];
    const processId = getProcessId(processInput);

    if (!processId || !processInput?.getAttribute("data-value")) {
      notify("Please select a process", "danger");
      return;
    }
    if (!selectedDescriptionsList.length) {
      notify("Please select at least one description", "danger");
      return;
    }
    if (!currencySelect?.value) {
      notify("Please select a currency", "danger");
      return;
    }

    if (selectedDataCaptureType === "CITIBET" || selectedDataCaptureType === "CITIBET_MAJOR") {
      const tableData = captureTableData();
      const hasData = tableData.rows.some((row) => row.some((cell) => cell.type === "data" && String(cell.value || "").trim() !== ""));
      if (!hasData) {
        notify("Please enter data in the table", "danger");
        return;
      }
    }

    convertTableFormatOnSubmit(selectedDataCaptureType);

    const form = document.getElementById("dataCaptureForm");
    if (!form) return;
    const formData = new FormData(form);
    const processCode = processInput ? String(processInput.getAttribute("data-process-code") || "").trim() : "";
    const processDisplayText = processInput ? String(processInput.textContent || "").trim() : "";

    const processData = {
      date: formData.get("capture_date"),
      process: processId,
      processName: processDisplayText,
      processCode,
      dataCaptureType: selectedDataCaptureType,
      descriptions: selectedDescriptionsList,
      currency: formData.get("currency"),
      currencyName: currencySelect?.options?.[currencySelect.selectedIndex]?.text || "",
      removeWord: formData.get("remove_word") || "",
      replaceWordFrom: formData.get("replace_word_from") || "",
      replaceWordTo: formData.get("replace_word_to") || "",
      remark: formData.get("remark") || "",
    };

    try {
      const tableData = captureTableData();
      localStorage.setItem("capturedTableData", JSON.stringify(tableData));
      localStorage.setItem("capturedProcessData", JSON.stringify(processData));
      localStorage.setItem("capturedDataCaptureType", selectedDataCaptureType);

      notify("Data captured successfully! Redirecting to summary...", "success");
      setTimeout(() => {
        if (typeof navigate === "function") {
          navigate("/datacapturesummary?success=1");
        } else {
          window.location.href = "datacapturesummary.php?success=1";
        }
      }, 1500);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error submitting data:", error);
      notify("Failed to capture data", "danger");
    }
  }, [navigate, notify, selectedDescriptions]);

  return { submit };
}
