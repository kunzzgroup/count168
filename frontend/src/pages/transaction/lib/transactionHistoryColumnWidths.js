/** Transaction History 列宽（%）— 总和 100%，表格随容器缩放，无需横向滚动 */

export const TRANSACTION_HISTORY_COL_PCT_WITH_DESC = {
  date: 7,
  product: 12,
  currency: 7,
  rate: 6,
  winLoss: 8,
  crDr: 8,
  balance: 9,
  description: 26,
  remark: 11,
  created: 6,
};

export const TRANSACTION_HISTORY_COL_PCT_NO_DESC = {
  date: 8,
  product: 14,
  currency: 8,
  rate: 7,
  winLoss: 10,
  crDr: 10,
  balance: 11,
  remark: 26,
  created: 6,
};

export function historyColumnDefs(includeDescription) {
  const pct = includeDescription ? TRANSACTION_HISTORY_COL_PCT_WITH_DESC : TRANSACTION_HISTORY_COL_PCT_NO_DESC;
  const cols = [
    { key: "date", className: "transaction-history-col-date", widthPct: pct.date },
    { key: "product", className: "transaction-history-col-product", widthPct: pct.product },
    { key: "currency", className: "transaction-history-col-currency", widthPct: pct.currency },
    { key: "rate", className: "transaction-history-col-rate", widthPct: pct.rate },
    { key: "winLoss", className: "transaction-history-col-winloss", widthPct: pct.winLoss },
    { key: "crDr", className: "transaction-history-col-crdr", widthPct: pct.crDr },
    { key: "balance", className: "transaction-history-col-balance", widthPct: pct.balance },
  ];
  if (includeDescription) {
    cols.push({ key: "description", className: "transaction-history-col-description", widthPct: pct.description });
  }
  cols.push(
    { key: "remark", className: "transaction-history-col-remark", widthPct: pct.remark },
    { key: "created", className: "transaction-history-col-created", widthPct: pct.created },
  );
  return cols;
}
