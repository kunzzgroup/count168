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
