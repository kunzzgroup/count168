/**
 * React-owned sub template grouping on refresh populate.
 * Fills cells via legacy applySubTemplatesToSummaryRow until that path is migrated.
 */
import {
  getSummaryProductValuesFromCell,
  normalizeSummaryIdProductText,
} from "./summaryIdProductUtils.js";

/** Collect main rows for an id_product (DOM order) with row_index for sub parent matching. */
export function collectMainRowsForIdProduct(idProduct) {
  const summaryTableBody = document.getElementById("summaryTableBody");
  if (!summaryTableBody) return [];

  const normalizedTargetId = normalizeSummaryIdProductText(idProduct);
  if (!normalizedTargetId) return [];

  const mains = [];
  const allRows = Array.from(summaryTableBody.querySelectorAll("tr"));
  allRows.forEach((row, domIndex) => {
    const productType = row.getAttribute("data-product-type") || "main";
    if (productType !== "main") return;

    const idProductCell = row.querySelector("td:first-child");
    const productValues = getSummaryProductValuesFromCell(idProductCell);
    const mainText = normalizeSummaryIdProductText(productValues.main || "");
    if (!mainText || mainText !== normalizedTargetId) return;

    const rowIndexAttr = row.getAttribute("data-row-index");
    const rowIndex =
      rowIndexAttr != null && rowIndexAttr !== "" && !Number.isNaN(Number(rowIndexAttr))
        ? Number(rowIndexAttr)
        : domIndex;
    mains.push({ row, rowIndex });
  });
  return mains;
}

/** Pick the main row a sub template should attach under (row_index alignment). */
export function findMainRowForSubTemplate(idProduct, subTemplate) {
  const mains = collectMainRowsForIdProduct(idProduct);
  if (mains.length === 0) return null;
  if (mains.length === 1) return mains[0].row;

  const desiredIndex =
    subTemplate && subTemplate.row_index !== undefined && subTemplate.row_index !== null
      ? Number(subTemplate.row_index)
      : null;

  if (desiredIndex !== null && !Number.isNaN(desiredIndex)) {
    let best = null;
    for (const info of mains) {
      if (info.rowIndex <= desiredIndex) {
        if (!best || info.rowIndex > best.rowIndex) {
          best = info;
        }
      }
    }
    if (best) return best.row;
  }

  return mains[0].row;
}

export function filterSubsForParentIdProduct(subs, originalIdProduct, normalizedIdProduct) {
  if (!Array.isArray(subs) || subs.length === 0) return [];
  return subs.filter((sub) => {
    const subParentNorm = (sub.parent_id_product || "").trim().replace(/^\d+\s+/, "").trim();
    const subParentBare = normalizeSummaryIdProductText(subParentNorm);
    return (
      subParentBare === normalizedIdProduct ||
      subParentNorm === (originalIdProduct || "").trim()
    );
  });
}

/**
 * Apply sub templates once per template id, grouped under the correct parent main row.
 */
export function applySubsForIdProductGroup(idProduct, subTemplates) {
  if (!Array.isArray(subTemplates) || subTemplates.length === 0) {
    return false;
  }

  const applyRow =
    typeof window.applySubTemplatesToSummaryRow === "function"
      ? window.applySubTemplatesToSummaryRow.bind(window)
      : null;
  if (!applyRow) {
    console.warn("applySubsForIdProductGroup: applySubTemplatesToSummaryRow not loaded");
    return false;
  }

  const appliedTemplateIds = new Set();
  const subsByMainRow = new Map();

  subTemplates.forEach((sub) => {
    if (!sub) return;
    const templateId = sub.id != null ? String(sub.id) : null;
    if (templateId && appliedTemplateIds.has(templateId)) {
      return;
    }

    const mainRow = findMainRowForSubTemplate(idProduct, sub);
    if (!mainRow) return;

    if (!subsByMainRow.has(mainRow)) {
      subsByMainRow.set(mainRow, []);
    }
    subsByMainRow.get(mainRow).push(sub);
    if (templateId) {
      appliedTemplateIds.add(templateId);
    }
  });

  if (subsByMainRow.size === 0) {
    return false;
  }

  subsByMainRow.forEach((subs, mainRow) => {
    applyRow(idProduct, mainRow, subs);
  });
  return true;
}

export function registerSummarySubTemplatePopulate() {
  window.__SUMMARY_APPLY_SUBS_FOR_ID_PRODUCT_GROUP__ = applySubsForIdProductGroup;
  window.__SUMMARY_FILTER_SUBS_FOR_PARENT__ = filterSubsForParentIdProduct;
}

export function unregisterSummarySubTemplatePopulate() {
  delete window.__SUMMARY_APPLY_SUBS_FOR_ID_PRODUCT_GROUP__;
  delete window.__SUMMARY_FILTER_SUBS_FOR_PARENT__;
}
