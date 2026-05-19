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
    const exactMain = mains.find((info) => info.rowIndex === desiredIndex);
    if (exactMain) return exactMain.row;

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
  const matched = subs.filter((sub) => {
    const subParentNorm = (sub.parent_id_product || "").trim().replace(/^\d+\s+/, "").trim();
    const subParentBare = normalizeSummaryIdProductText(subParentNorm);
    return (
      subParentBare === normalizedIdProduct ||
      subParentNorm === (originalIdProduct || "").trim()
    );
  });
  return dedupeSubTemplatesByAccount(matched);
}

/** One sub row per account_id — keep newest template when DB has duplicates (different sub_order/variant). */
export function dedupeSubTemplatesByAccount(subTemplates) {
  if (!Array.isArray(subTemplates) || subTemplates.length === 0) return [];

  const byAccount = new Map();
  subTemplates.forEach((sub) => {
    if (!sub) return;
    const accountId = sub.account_id != null ? String(sub.account_id).trim() : "";
    const key = accountId || (sub.template_key != null ? String(sub.template_key) : "") || (sub.id != null ? `id:${sub.id}` : "");
    if (!key) return;

    const existing = byAccount.get(key);
    if (!existing) {
      byAccount.set(key, sub);
      return;
    }
    const existingTs = existing.updated_at || "";
    const currentTs = sub.updated_at || "";
    if (currentTs > existingTs) {
      byAccount.set(key, sub);
      return;
    }
    if (currentTs === existingTs && sub.id != null && existing.id != null && Number(sub.id) > Number(existing.id)) {
      byAccount.set(key, sub);
    }
  });

  return Array.from(byAccount.values());
}

/**
 * Apply sub templates once per template id, grouped under the correct parent main row.
 */
export function applySubsForIdProductGroup(idProduct, subTemplates) {
  if (!Array.isArray(subTemplates) || subTemplates.length === 0) {
    return false;
  }

  const groupKey = normalizeSummaryIdProductText(idProduct);
  if (groupKey) {
    if (!window.__SUMMARY_APPLIED_SUB_GROUPS__) {
      window.__SUMMARY_APPLIED_SUB_GROUPS__ = new Set();
    }
    if (window.__SUMMARY_APPLIED_SUB_GROUPS__.has(groupKey)) {
      console.log("applySubsForIdProductGroup: skip duplicate group apply for", groupKey);
      return true;
    }
    window.__SUMMARY_APPLIED_SUB_GROUPS__.add(groupKey);
  }

  const uniqueSubs = dedupeSubTemplatesByAccount(subTemplates);
  if (uniqueSubs.length === 0) {
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

  const subsByMainRow = new Map();

  uniqueSubs.forEach((sub) => {
    if (!sub) return;

    const mainRow = findMainRowForSubTemplate(idProduct, sub);
    if (!mainRow) return;

    if (!subsByMainRow.has(mainRow)) {
      subsByMainRow.set(mainRow, []);
    }
    subsByMainRow.get(mainRow).push(sub);
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
  window.__SUMMARY_DEDUPE_SUB_TEMPLATES_BY_ACCOUNT__ = dedupeSubTemplatesByAccount;
}

export function unregisterSummarySubTemplatePopulate() {
  delete window.__SUMMARY_APPLY_SUBS_FOR_ID_PRODUCT_GROUP__;
  delete window.__SUMMARY_FILTER_SUBS_FOR_PARENT__;
  delete window.__SUMMARY_DEDUPE_SUB_TEMPLATES_BY_ACCOUNT__;
}
