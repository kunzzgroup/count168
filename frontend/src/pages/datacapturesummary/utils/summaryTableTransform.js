export function extractSummaryRowsFromCapturedTable(tableData) {
  const columnAData = [];
  const rowIndexMap = [];
  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  rows.forEach((rowData, rowIndex) => {
    if (!Array.isArray(rowData) || rowData.length <= 1 || rowData[1]?.type !== "data") return;
    const cellValue = String(rowData[1]?.value ?? "");
    if (rowIndex === 3 && cellValue.trim() !== "") {
      const trimmed = cellValue.trim();
      if (trimmed.includes("\n")) {
        const entries = trimmed
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (entries.length > 1) {
          entries.forEach((entry) => {
            columnAData.push(entry);
            rowIndexMap.push(rowIndex);
          });
          return;
        }
      }
    }
    columnAData.push(cellValue);
    rowIndexMap.push(rowIndex);
  });

  return columnAData
    .map((value, index) => ({ value: String(value ?? "").trim(), originalRowIndex: rowIndexMap[index] ?? index }))
    .filter((item) => item.value !== "")
    .map((item, index) => ({
      id: `${item.value}-${index}`,
      idProduct: item.value,
      originalRowIndex: item.originalRowIndex,
      account: "",
      accountId: null,
      currency: "",
      currencyId: null,
      formula: "",
      source: "",
      rateChecked: false,
      rateValue: "",
      baseProcessedAmount: "0.00",
      processedAmount: "0.00",
      skipChecked: false,
      deleteChecked: false,
    }));
}
