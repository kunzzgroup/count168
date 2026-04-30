function compactMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  const normalizedRows = matrix
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => String(cell || "").replace(/\u00A0/g, " ").trim()));
  if (normalizedRows.length === 0) return [];
  const maxCols = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0);
  if (maxCols <= 0) return [];

  const padded = normalizedRows.map((row) => {
    const next = row.slice();
    while (next.length < maxCols) next.push("");
    return next;
  });

  const nonEmptyCols = [];
  for (let c = 0; c < maxCols; c += 1) {
    const hasValue = padded.some((row) => String(row[c] || "").trim() !== "");
    if (hasValue) nonEmptyCols.push(c);
  }
  if (nonEmptyCols.length === 0) return [];
  const firstCol = nonEmptyCols[0];
  const lastCol = nonEmptyCols[nonEmptyCols.length - 1];

  return padded
    .map((row) => row.slice(firstCol, lastCol + 1))
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""));
}

function normalizeMatrixFromText(text) {
  if (!text || !String(text).trim()) return [];
  const rows = String(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.split("\t").map((v) => String(v || "").trim()))
    .filter((row) => row.some((v) => v !== ""));
  return compactMatrix(rows);
}

function parseTableMatrixFromHtml(html) {
  if (!html || !String(html).trim()) return [];
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  const table = doc.querySelector("table");
  if (!table) return [];
  const carry = [];
  const rows = [];

  Array.from(table.querySelectorAll("tr")).forEach((tr) => {
    const row = [];
    let col = 0;

    const consumeCarry = () => {
      while (carry[col] && carry[col].rowsLeft > 0) {
        row[col] = carry[col].value;
        carry[col].rowsLeft -= 1;
        if (carry[col].rowsLeft <= 0) carry[col] = null;
        col += 1;
      }
    };

    Array.from(tr.querySelectorAll("th,td")).forEach((cell) => {
      consumeCarry();
      const value = String(cell.textContent || "").replace(/\u00A0/g, " ").trim();
      const colspan = Math.max(1, Number(cell.getAttribute("colspan") || 1));
      const rowspan = Math.max(1, Number(cell.getAttribute("rowspan") || 1));
      for (let i = 0; i < colspan; i += 1) {
        row[col + i] = value;
        if (rowspan > 1) {
          carry[col + i] = { value, rowsLeft: rowspan - 1 };
        }
      }
      col += colspan;
    });

    consumeCarry();
    rows.push(row);
  });

  return compactMatrix(rows);
}

function parseClipboardMatrix(clipboardData) {
  if (!clipboardData) return [];
  const htmlRows = parseTableMatrixFromHtml(clipboardData.getData("text/html"));
  if (htmlRows.length > 0) return htmlRows;
  return normalizeMatrixFromText(clipboardData.getData("text/plain"));
}

function parseMatrixFromPasteArea(node) {
  if (!node) return [];
  const htmlRows = parseTableMatrixFromHtml(node.innerHTML || "");
  if (htmlRows.length > 0) return htmlRows;
  return normalizeMatrixFromText(node.innerText || node.textContent || "");
}

export { compactMatrix, normalizeMatrixFromText, parseTableMatrixFromHtml, parseClipboardMatrix, parseMatrixFromPasteArea };
