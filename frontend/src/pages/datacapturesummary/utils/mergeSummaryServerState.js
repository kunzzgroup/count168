export function mergeSummaryRowsFromServerState(summaryRows, saved) {
  if (!saved || typeof saved !== "object" || !Array.isArray(summaryRows)) return summaryRows;

  const stable = saved.rowsByStableKey || {};
  const byKey = saved.rowsByKey || {};

  return summaryRows.map((r) => {
    const stableKey = `${r.idProduct}::${r.originalRowIndex}`;
    let patch = stable[stableKey] || byKey[stableKey];
    if (!patch || typeof patch !== "object") {
      const alt = stable[r.idProduct] || byKey[r.idProduct];
      if (alt && typeof alt === "object") patch = alt;
    }
    if (!patch || typeof patch !== "object") return r;

    const accountId = patch.accountDbId ?? patch.accountId ?? r.accountId;
    const currencyId = patch.currencyDbId ?? patch.currencyId ?? r.currencyId;

    return {
      ...r,
      formula: patch.formula != null && String(patch.formula).trim() !== "" ? patch.formula : r.formula,
      source: patch.source != null && String(patch.source).trim() !== "" ? patch.source : r.source,
      rateValue: patch.rateValue != null && patch.rateValue !== "" ? patch.rateValue : r.rateValue,
      rateChecked: patch.rateChecked != null ? patch.rateChecked : r.rateChecked,
      accountId: accountId != null ? accountId : r.accountId,
      currencyId: currencyId != null ? currencyId : r.currencyId,
    };
  });
}
