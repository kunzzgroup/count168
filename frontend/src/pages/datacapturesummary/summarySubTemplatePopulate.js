/**
 * React-owned sub template grouping on refresh populate.
 * Fills cells via legacy applySubTemplatesToSummaryRow until that path is migrated.
 */
import {
  getSummaryProductValuesFromCell,
  normalizeSummaryIdProductText,
} from "./summaryIdProductUtils.js";

/** Collect main rows whose id_product matches parent (exact first). */
export function collectMainRowsForParent(parentIdProduct, { matchMode = "exact" } = {}) {
  const summaryTableBody = document.getElementById("summaryTableBody");
  if (!summaryTableBody) return [];

  const parentTrimmed = (parentIdProduct || "").trim();
  if (!parentTrimmed) return [];

  const parentNorm = normalizeSummaryIdProductText(parentTrimmed);
  const mains = [];
  const allRows = Array.from(summaryTableBody.querySelectorAll("tr"));
  allRows.forEach((row, domIndex) => {
    const productType = row.getAttribute("data-product-type") || "main";
    if (productType !== "main") return;

    const idProductCell = row.querySelector("td:first-child");
    const productValues = getSummaryProductValuesFromCell(idProductCell);
    const mainRaw = (productValues.main || idProductCell?.textContent || "").trim();
    const mainNorm = normalizeSummaryIdProductText(mainRaw);

    let matches = false;
    if (matchMode === "exact") {
      matches = mainRaw === parentTrimmed;
    } else if (matchMode === "normalized") {
      matches = Boolean(parentNorm && mainNorm && mainNorm === parentNorm);
    }

    if (!matches) return;

    const rowIndexAttr = row.getAttribute("data-row-index");
    const rowIndex =
      rowIndexAttr != null && rowIndexAttr !== "" && !Number.isNaN(Number(rowIndexAttr))
        ? Number(rowIndexAttr)
        : domIndex;
    mains.push({ row, rowIndex, mainRaw });
  });
  return mains;
}

/** @deprecated Use collectMainRowsForParent */
export function collectMainRowsForIdProduct(idProduct) {
  return collectMainRowsForParent(idProduct, { matchMode: "normalized" });
}

function pickMainByRowIndexRange(mains, subTemplate) {
  if (mains.length === 0) return null;
  if (mains.length === 1) return mains[0].row;

  const sortedMains = [...mains].sort((a, b) => a.rowIndex - b.rowIndex);
  const subRowIndex =
    subTemplate && subTemplate.row_index !== undefined && subTemplate.row_index !== null
      ? Number(subTemplate.row_index)
      : null;

  if (subRowIndex !== null && !Number.isNaN(subRowIndex)) {
    for (let i = 0; i < sortedMains.length; i += 1) {
      const mainRowIndex = sortedMains[i].rowIndex;
      const nextMainRowIndex =
        i < sortedMains.length - 1 ? sortedMains[i + 1].rowIndex : Number.POSITIVE_INFINITY;
      if (subRowIndex >= mainRowIndex && subRowIndex < nextMainRowIndex) {
        return sortedMains[i].row;
      }
    }
    const exactMain = sortedMains.find((info) => info.rowIndex === subRowIndex);
    if (exactMain) return exactMain.row;
  }

  return null;
}

/** Pick the main row a sub template should attach under (parent_id_product + row_index). */
export function findMainRowForSubTemplate(idProduct, subTemplate) {
  const parentExact = (subTemplate?.parent_id_product || idProduct || "").trim();
  if (!parentExact) return null;

  let mains = collectMainRowsForParent(parentExact, { matchMode: "exact" });
  if (mains.length === 0) {
    const normalizedCandidates = collectMainRowsForParent(parentExact, { matchMode: "normalized" });
    if (normalizedCandidates.length === 1) {
      mains = normalizedCandidates;
    } else {
      return null;
    }
  }

  const picked = pickMainByRowIndexRange(mains, subTemplate);
  if (picked) return picked;

  if (mains.length === 1) return mains[0].row;
  return null;
}

export function filterSubsForParentIdProduct(subs, originalIdProduct, normalizedIdProduct) {
  if (!Array.isArray(subs) || subs.length === 0) return [];
  const parentExact = (originalIdProduct || "").trim();
  const parentNorm = (normalizedIdProduct || normalizeSummaryIdProductText(parentExact) || "").trim();

  return subs.filter((sub) => {
    const subParentRaw = (sub.parent_id_product || "").trim().replace(/^\d+\s+/, "").trim();
    if (!subParentRaw) return false;
    if (parentExact && subParentRaw === parentExact) return true;
    if (parentNorm) {
      const subParentBare = normalizeSummaryIdProductText(subParentRaw);
      return subParentBare === parentNorm;
    }
    return false;
  });
}

function subBelongsToParentGroup(sub, parentExact) {
  const subParentRaw = (sub?.parent_id_product || "").trim().replace(/^\d+\s+/, "").trim();
  if (!subParentRaw || !parentExact) return false;
  if (subParentRaw === parentExact) return true;
  const subParentBare = normalizeSummaryIdProductText(subParentRaw);
  const parentBare = normalizeSummaryIdProductText(parentExact);
  return Boolean(parentBare && subParentBare === parentBare);
}

function getGlobalAppliedTemplateIds() {
  if (!window.__SUMMARY_GLOBAL_APPLIED_TEMPLATE_IDS__) {
    window.__SUMMARY_GLOBAL_APPLIED_TEMPLATE_IDS__ = new Set();
  }
  return window.__SUMMARY_GLOBAL_APPLIED_TEMPLATE_IDS__;
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

  const parentExact = (idProduct || "").trim();
  const scopedSubs = subTemplates.filter((sub) => subBelongsToParentGroup(sub, parentExact));
  if (scopedSubs.length === 0) {
    return false;
  }

  const appliedTemplateIds = getGlobalAppliedTemplateIds();
  const subsByMainRow = new Map();

  scopedSubs.forEach((sub) => {
    if (!sub) return;
    const templateId = sub.id != null ? String(sub.id) : null;
    if (templateId && appliedTemplateIds.has(`id:${templateId}`)) {
      return;
    }

    const mainRow = findMainRowForSubTemplate(parentExact, sub);
    if (!mainRow) return;

    const accountKey =
      sub.account_id != null
        ? `${String(sub.account_id)}:${sub.sub_order != null ? Number(sub.sub_order) : ""}:${sub.formula_variant != null ? sub.formula_variant : ""}`
        : null;
    const parentRowIndexAttr = mainRow.getAttribute("data-row-index");
    const parentRowIndex =
      parentRowIndexAttr != null && parentRowIndexAttr !== "" && !Number.isNaN(Number(parentRowIndexAttr))
        ? Number(parentRowIndexAttr)
        : "na";
    const scopedKey = accountKey ? `acc:${parentRowIndex}:${accountKey}` : null;
    if (scopedKey && appliedTemplateIds.has(scopedKey)) {
      return;
    }

    if (!subsByMainRow.has(mainRow)) {
      subsByMainRow.set(mainRow, []);
    }
    subsByMainRow.get(mainRow).push(sub);
    if (templateId) {
      appliedTemplateIds.add(`id:${templateId}`);
    }
    if (scopedKey) {
      appliedTemplateIds.add(scopedKey);
    }
  });

  if (subsByMainRow.size === 0) {
    return false;
  }

  subsByMainRow.forEach((subs, mainRow) => {
    const idCell = mainRow.querySelector("td:first-child");
    const pv = getSummaryProductValuesFromCell(idCell);
    const mainIdProduct = (pv.main || parentExact || idProduct || "").trim();
    applyRow(mainIdProduct, mainRow, subs);
  });
  return true;
}

export function registerSummarySubTemplatePopulate() {
  window.__SUMMARY_APPLY_SUBS_FOR_ID_PRODUCT_GROUP__ = applySubsForIdProductGroup;
  window.__SUMMARY_FILTER_SUBS_FOR_PARENT__ = filterSubsForParentIdProduct;
  window.__SUMMARY_RESET_GLOBAL_APPLIED_TEMPLATE_IDS__ = () => {
    window.__SUMMARY_GLOBAL_APPLIED_TEMPLATE_IDS__ = new Set();
  };
}

export function unregisterSummarySubTemplatePopulate() {
  delete window.__SUMMARY_APPLY_SUBS_FOR_ID_PRODUCT_GROUP__;
  delete window.__SUMMARY_FILTER_SUBS_FOR_PARENT__;
  delete window.__SUMMARY_RESET_GLOBAL_APPLIED_TEMPLATE_IDS__;
}
