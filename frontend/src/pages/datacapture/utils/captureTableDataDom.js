/** Read `#dataTable` structure for submit / validation (matches legacy captureTableData shape). */

export function convertBracketedToNegative(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  const bracketMatch = trimmed.match(/^\(([^)]+)\)$/);
  if (!bracketMatch) return trimmed;
  return `-${bracketMatch[1].trim()}`;
}

export function captureTableDataFromDom() {
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

export function citibetCaptureTableHasData(tableData) {
  if (!tableData?.rows?.length) return false;
  return tableData.rows.some((row) =>
    Array.isArray(row)
      ? row.some((cell) => cell?.type === "data" && String(cell.value || "").trim() !== "")
      : false,
  );
}

export function applyTableDataToDom(tableData) {
  const table = document.getElementById("dataTable");
  if (!table) return;
  const headerRow = table.querySelector("thead tr");
  const tableBody = table.querySelector("tbody");
  if (!headerRow || !tableBody) return;

  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  const dataColCount = rows.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.filter((cell) => cell?.type === "data").length : 0),
    0,
  );

  headerRow.innerHTML = "";
  const rowHeaderTh = document.createElement("th");
  rowHeaderTh.textContent = "#";
  headerRow.appendChild(rowHeaderTh);
  for (let c = 0; c < dataColCount; c += 1) {
    const th = document.createElement("th");
    th.textContent = String(c + 1);
    headerRow.appendChild(th);
  }

  tableBody.innerHTML = "";
  rows.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("td");
    rowHeader.className = "row-header";
    const headerCell = Array.isArray(row) ? row.find((cell) => cell?.type === "header") : null;
    rowHeader.textContent = String(headerCell?.value || rowIdx + 1);
    tr.appendChild(rowHeader);

    const dataCells = Array.isArray(row) ? row.filter((cell) => cell?.type === "data") : [];
    for (let c = 0; c < dataColCount; c += 1) {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.dataset.col = String(c);
      td.textContent = String(dataCells[c]?.value || "");
      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  });
}
