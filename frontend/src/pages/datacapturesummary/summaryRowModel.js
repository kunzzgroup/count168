import { buildColumnAEntries } from "./summaryColumnAData.js";

function normalizeIdProduct(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

function makeMainRowKey(entry, index) {
  return `main-${entry.rowIndex}-${index}-${normalizeIdProduct(entry.idProduct)}`;
}

/** Initial main rows from captured table column A. */
export function buildInitialSummaryRows(tableData) {
  if (!tableData) return [];
  const { entries } = buildColumnAEntries(tableData);
  return entries
    .filter((e) => e.idProduct?.trim())
    .map((entry, index) => ({
      key: makeMainRowKey(entry, index),
      idProduct: entry.idProduct,
      rowIndex: entry.rowIndex,
      productType: "main",
      parentIdProduct: null,
      parentRowIndex: null,
    }));
}

/**
 * Insert a sub-row descriptor after the row matching insertAfterKey (or after parent main block).
 */
export function insertSubRowInModel(rows, parentProcessValue, insertAfterKey, rowIndex) {
  const parentTrimmed = String(parentProcessValue || "").trim();
  const parentNorm = normalizeIdProduct(parentTrimmed);
  const numericRowIndex =
    rowIndex != null && rowIndex !== "" && !Number.isNaN(Number(rowIndex)) ? Number(rowIndex) : null;

  const newRow = {
    key: `sub-${numericRowIndex ?? "na"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    idProduct: parentTrimmed,
    rowIndex: numericRowIndex ?? 0,
    productType: "sub",
    parentIdProduct: parentTrimmed,
    parentRowIndex: numericRowIndex,
  };

  if (insertAfterKey) {
    const idx = rows.findIndex((r) => r.key === insertAfterKey);
    if (idx >= 0) {
      const next = rows.slice();
      next.splice(idx + 1, 0, newRow);
      return { rows: next, newKey: newRow.key };
    }
  }

  let insertIdx = rows.length;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.productType !== "main") continue;
    if (normalizeIdProduct(row.idProduct) !== parentNorm) continue;
    insertIdx = i + 1;
    while (
      insertIdx < rows.length &&
      rows[insertIdx].productType === "sub" &&
      normalizeIdProduct(rows[insertIdx].parentIdProduct) === parentNorm
    ) {
      insertIdx += 1;
    }
    break;
  }

  const next = rows.slice();
  next.splice(insertIdx, 0, newRow);
  return { rows: next, newKey: newRow.key };
}

/** Read tbody row order from DOM, preserving React row keys when present. */
export function readSummaryRowsFromDom(fallbackRows = []) {
  const tbody = document.getElementById("summaryTableBody");
  if (!tbody) return fallbackRows;

  const fallbackByKey = new Map(fallbackRows.map((r) => [r.key, r]));

  return Array.from(tbody.querySelectorAll("tr")).map((tr, domIndex) => {
    const existingKey = tr.getAttribute("data-react-row-key");
    const productType = tr.getAttribute("data-product-type") || "main";
    const idCell = tr.querySelector("td:first-child");
    const idProduct =
      idCell?.getAttribute("data-main-product")?.trim() ||
      idCell?.textContent?.trim() ||
      "";
    const rowIndexAttr = tr.getAttribute("data-row-index");
    const rowIndex =
      rowIndexAttr != null && rowIndexAttr !== "" && !Number.isNaN(Number(rowIndexAttr))
        ? Number(rowIndexAttr)
        : domIndex;
    const parentRowIndexAttr = tr.getAttribute("data-parent-row-index");
    const parentRowIndex =
      parentRowIndexAttr != null &&
      parentRowIndexAttr !== "" &&
      !Number.isNaN(Number(parentRowIndexAttr))
        ? Number(parentRowIndexAttr)
        : null;
    const parentIdProduct = tr.getAttribute("data-parent-id-product")?.trim() || null;

    const key =
      existingKey ||
      fallbackRows[domIndex]?.key ||
      `${productType}-${rowIndex}-${domIndex}-${normalizeIdProduct(idProduct)}`;

    const prior = fallbackByKey.get(key);
    return {
      key,
      idProduct: idProduct || prior?.idProduct || "",
      rowIndex: prior?.rowIndex ?? rowIndex,
      productType,
      parentIdProduct: parentIdProduct || prior?.parentIdProduct || null,
      parentRowIndex: parentRowIndex ?? prior?.parentRowIndex ?? null,
    };
  });
}

export function notifySummaryReactRowsChanged() {
  window.__SUMMARY_REACT_SYNC_ROWS_FROM_DOM__?.();
}
