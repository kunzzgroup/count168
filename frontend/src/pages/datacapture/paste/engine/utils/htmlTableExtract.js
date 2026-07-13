/** Extract string[][] from an HTML table string or Element (browser DOM). */

function cellPlain(el) {
  let text = el.textContent || el.innerText || "";
  return String(text).replace(/\s+/g, " ").trim();
}

function expandColspan(cell, row) {
  const colspan = Number.parseInt(cell.getAttribute("colspan") || "1", 10) || 1;
  const text = cellPlain(cell);
  row.push(text);
  for (let i = 1; i < colspan; i += 1) row.push("");
}

/**
 * @param {string|Element} htmlOrRoot
 * @returns {{ headers: string[], rows: string[][], meta: object } | null}
 */
export function extractMatrixFromHtmlTable(htmlOrRoot) {
  let root;
  if (typeof htmlOrRoot === "string") {
    if (typeof document === "undefined") return null;
    root = document.createElement("div");
    root.innerHTML = htmlOrRoot;
  } else {
    root = htmlOrRoot;
  }
  if (!root) return null;

  const table = root.querySelector?.("table") || (root.tagName === "TABLE" ? root : null);
  if (!table) return null;

  const matrix = [];
  const thead = table.querySelector("thead");
  if (thead) {
    thead.querySelectorAll("tr").forEach((tr) => {
      const row = [];
      tr.querySelectorAll("th, td").forEach((cell) => expandColspan(cell, row));
      if (row.some((c) => c !== "")) matrix.push(row);
    });
  }

  let body = table.querySelector("tbody") || table;
  body.querySelectorAll("tr").forEach((tr) => {
    if (thead && tr.closest("thead")) return;
    const row = [];
    tr.querySelectorAll("td, th").forEach((cell) => expandColspan(cell, row));
    if (row.some((c) => c !== "")) matrix.push(row);
  });

  if (!matrix.length) return null;

  const maxCols = Math.max(...matrix.map((r) => r.length));
  const padded = matrix.map((r) => {
    const next = r.slice();
    while (next.length < maxCols) next.push("");
    return next;
  });

  return {
    headers: [],
    rows: padded,
    meta: { source: "html-table", colCount: maxCols },
  };
}
