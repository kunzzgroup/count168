import { computeProcessedAmounts } from "./summaryNumberUtils.js";
import { normalizeIdProductText, isFullIdProduct, resolveFormulaExpressionFromTemplate } from "./captureTableFormulaResolve.js";

function normalizeSpaces(s) {
  return (s || "").trim().replace(/\s+/g, "");
}

function productRowMatchesTemplateKey(rowProduct, templateKey) {
  const rp = (rowProduct || "").trim();
  const tk = (templateKey || "").trim();
  if (!rp || !tk) return false;
  if (rp === tk) return true;
  if (isFullIdProduct(tk) || isFullIdProduct(rp)) {
    return normalizeSpaces(rp) === normalizeSpaces(tk);
  }
  return normalizeIdProductText(rp) === normalizeIdProductText(tk);
}

function accountDisplayFromOption(acc) {
  if (!acc) return "";
  const aid = (acc.account_id || "").trim();
  const name = (acc.name || "").trim();
  return name ? `${aid} (${name})` : aid;
}

function pickMainCandidate(rows, templateKey, mainTemplate, appliedIds) {
  const mainsOnly = rows.filter((r) => !r.productType || r.productType === "main");
  const candidates = mainsOnly
    .filter((r) => productRowMatchesTemplateKey(r.idProduct, templateKey) && !appliedIds.has(r.id))
    .sort((a, b) => (a.originalRowIndex ?? 0) - (b.originalRowIndex ?? 0));

  const tRi = mainTemplate.row_index;
  const tAid = mainTemplate.account_id != null ? String(mainTemplate.account_id).trim() : "";

  if (tRi !== undefined && tRi !== null && tRi !== "") {
    const exact = candidates.find((c) => Number(c.originalRowIndex) === Number(tRi));
    if (exact) return exact;
  }

  if (tAid) {
    const byAcc = candidates.filter((c) => c.accountId != null && String(c.accountId) === tAid);
    if (byAcc.length === 1) return byAcc[0];
    if (byAcc.length > 1 && tRi !== undefined && tRi !== null && tRi !== "") {
      const ex = byAcc.find((c) => Number(c.originalRowIndex) === Number(tRi));
      if (ex) return ex;
    }
  }

  if (candidates.length === 1) return candidates[0];

  return candidates[0] ?? null;
}

function isEmptySubTemplate(t) {
  const sourceColumns = t.source_columns || "";
  const formulaOperators = t.formula_operators || "";
  const formulaDisplay = t.formula_display || "";
  const lastSourceValue = t.last_source_value || "";
  const isColumnsEmpty = !sourceColumns || sourceColumns.trim() === "";
  const isFormulaOperatorsEmpty = !formulaOperators || formulaOperators.trim() === "";
  const isFormulaDisplayEmpty = !formulaDisplay || formulaDisplay.trim() === "" || formulaDisplay === "Formula";
  const isSourceEmpty = !lastSourceValue || lastSourceValue.trim() === "" || lastSourceValue === "Source";
  return isColumnsEmpty && isFormulaOperatorsEmpty && isFormulaDisplayEmpty && isSourceEmpty;
}

function applyMainFields(row, mainTemplate, tableData, accountOptions, currencyOptions) {
  const { formula, source } = resolveFormulaExpressionFromTemplate(mainTemplate, tableData, row.originalRowIndex ?? null);
  const updates = { ...row };

  const accId = mainTemplate.account_id != null ? Number(mainTemplate.account_id) : null;
  if (accId) {
    const acc = accountOptions.find((a) => Number(a.id) === accId);
    updates.accountId = accId;
    updates.account = accountDisplayFromOption(acc) || String(accId);
  }

  const curId = mainTemplate.currency_id != null ? Number(mainTemplate.currency_id) : null;
  if (curId) {
    const cur = currencyOptions.find((c) => Number(c.id) === curId);
    updates.currencyId = curId;
    updates.currency = cur?.code || "";
  }

  updates.formula = formula || updates.formula || "";
  updates.source = source !== undefined && source !== "" ? source : updates.source || "1";
  Object.assign(updates, computeProcessedAmounts(updates.formula, updates.source || "1", updates.rateValue || ""));
  updates.templateVariant = mainTemplate.formula_variant ?? null;
  return updates;
}

function buildSubRow(parentRow, subTemplate, tableData, accountOptions, currencyOptions, subIdx) {
  const subId = (subTemplate.id_product || "").trim() || `sub-${subIdx}`;
  const { formula, source } = resolveFormulaExpressionFromTemplate(subTemplate, tableData, parentRow.originalRowIndex ?? null);
  const row = {
    id: `tpl-sub-${parentRow.id}-${subTemplate.id ?? subIdx}-${subIdx}`,
    idProduct: subId,
    originalRowIndex: parentRow.originalRowIndex ?? 0,
    account: "",
    accountId: null,
    currency: parentRow.currency || "",
    currencyId: parentRow.currencyId ?? null,
    formula: formula || "",
    source: source || "1",
    rateChecked: false,
    rateValue: "",
    baseProcessedAmount: "0.00",
    processedAmount: "0.00",
    skipChecked: false,
    deleteChecked: false,
    productType: "sub",
    parentIdProduct: (subTemplate.parent_id_product || parentRow.idProduct || "").trim(),
  };

  const accId = subTemplate.account_id != null ? Number(subTemplate.account_id) : null;
  if (accId) {
    const acc = accountOptions.find((a) => Number(a.id) === accId);
    row.accountId = accId;
    row.account = accountDisplayFromOption(acc) || String(accId);
  }

  const curId = subTemplate.currency_id != null ? Number(subTemplate.currency_id) : null;
  if (curId) {
    const cur = currencyOptions.find((c) => Number(c.id) === curId);
    row.currencyId = curId;
    row.currency = cur?.code || "";
  }

  Object.assign(row, computeProcessedAmounts(row.formula, row.source || "1", row.rateValue || ""));
  return row;
}

/**
 * Applies Maintenance templates (summary_api action=templates) to summary rows.
 */
export function applyMaintenanceTemplates(summaryRows, templates, tableData, accountOptions, currencyOptions) {
  if (!templates || typeof templates !== "object" || !Array.isArray(summaryRows)) return summaryRows.map((r) => ({ ...r }));

  let rows = summaryRows.map((r) => ({ ...r }));
  const appliedIds = new Set();

  Object.keys(templates).forEach((templateKey) => {
    const tpl = templates[templateKey];
    if (!tpl) return;

    const mains =
      tpl.allMains && Array.isArray(tpl.allMains) && tpl.allMains.length > 0
        ? [...tpl.allMains].sort((a, b) => {
            const ai = a.row_index !== undefined && a.row_index !== null ? Number(a.row_index) : 999999;
            const bi = b.row_index !== undefined && b.row_index !== null ? Number(b.row_index) : 999999;
            return ai - bi;
          })
        : tpl.main
          ? [tpl.main]
          : [];

    const appliedMainRows = [];

    mains.forEach((mainTpl) => {
      const cand = pickMainCandidate(rows, templateKey, mainTpl, appliedIds);
      if (!cand) return;
      appliedIds.add(cand.id);
      const idx = rows.findIndex((r) => r.id === cand.id);
      if (idx >= 0) {
        rows[idx] = applyMainFields(rows[idx], mainTpl, tableData, accountOptions, currencyOptions);
        appliedMainRows.push(rows[idx]);
      }
    });

    const subs = Array.isArray(tpl.subs) ? tpl.subs.filter((s) => !isEmptySubTemplate(s)) : [];
    if (!subs.length || !appliedMainRows.length) return;

    subs.sort((a, b) => {
      const aSub = a.sub_order != null ? Number(a.sub_order) : null;
      const bSub = b.sub_order != null ? Number(b.sub_order) : null;
      if (aSub != null && bSub != null && aSub !== bSub) return aSub - bSub;
      const aRi = a.row_index != null ? Number(a.row_index) : 999999;
      const bRi = b.row_index != null ? Number(b.row_index) : 999999;
      if (aRi !== bRi) return aRi - bRi;
      return (a.id || 0) - (b.id || 0);
    });

    const parentRow = appliedMainRows[appliedMainRows.length - 1];
    let insertAt = rows.findIndex((r) => r.id === parentRow.id);
    if (insertAt < 0) insertAt = rows.length - 1;

    subs.forEach((subTpl, i) => {
      insertAt += 1;
      const subRow = buildSubRow(parentRow, subTpl, tableData, accountOptions, currencyOptions, i);
      rows.splice(insertAt, 0, subRow);
    });
  });

  return rows;
}
