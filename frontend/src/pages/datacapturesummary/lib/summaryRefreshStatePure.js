/** Persist formula/rate draft before refresh or back (pure React, no legacy). */
export function saveSummaryRefreshStatePure(rows, processMeta) {
  try {
    const payload = {
      processId: processMeta?.processId ?? null,
      processCode: processMeta?.processCode ?? "",
      rowOrder: rows.map((r) => r.key),
      rows: rows
        .filter((r) => r.account?.trim() || r.formulaOperators || r.formulaDisplay)
        .map((row) => ({
          idProduct: row.idProduct,
          displayOrder: row.rowIndex,
          account: row.account,
          accountId: row.accountId,
          currency: row.currency,
          currencyId: row.currencyId,
          formula: row.formulaDisplay || row.formula,
          formulaOperators: row.formulaOperators,
          sourcePercent: row.sourcePercent,
          processedAmount: row.processedAmount,
          baseProcessedAmount: row.baseProcessedAmount,
          rateChecked: row.rateChecked,
          rateValue: row.rateValue,
          selectChecked: row.selectChecked,
          productType: row.productType,
          subOrder: row.subOrder,
        })),
    };
    localStorage.setItem("capturedTableFormulaSourceForRefresh", JSON.stringify(payload));

    const rateMap = {};
    const rateByProduct = {};
    for (const row of rows) {
      if (!row.rateChecked && !row.rateValue) continue;
      const key = row.key;
      rateMap[key] = { checked: row.rateChecked, value: row.rateValue || "" };
      if (row.idProduct) {
        rateByProduct[row.idProduct] = { checked: row.rateChecked, value: row.rateValue || "" };
      }
    }
    localStorage.setItem("capturedTableRateValues", JSON.stringify(rateMap));
    localStorage.setItem("capturedTableRateValuesByProductId", JSON.stringify(rateByProduct));
  } catch {
    /* ignore */
  }
}
