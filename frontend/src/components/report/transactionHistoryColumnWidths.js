/** Transaction History 固定列宽（px）— 全系统统一基准 */
export const TRANSACTION_HISTORY_COLUMN_WIDTHS = {
  date: 100,
  product: 180,
  currency: 80,
  rate: 80,
  winLoss: 100,
  crDr: 100,
  balance: 120,
  description: 280,
  remark: 180,
  created: 120,
};

export const TRANSACTION_HISTORY_TABLE_MIN_WIDTH = 1350;

export function transactionHistoryColumnList({ includeDescription = true } = {}) {
  const w = TRANSACTION_HISTORY_COLUMN_WIDTHS;
  const cols = [
    { key: "date", className: "transaction-history-col-date", width: w.date },
    { key: "product", className: "transaction-history-col-product", width: w.product },
    { key: "currency", className: "transaction-history-col-currency", width: w.currency },
    { key: "rate", className: "transaction-history-col-rate", width: w.rate },
    { key: "winLoss", className: "transaction-history-col-winloss", width: w.winLoss },
    { key: "crDr", className: "transaction-history-col-crdr", width: w.crDr },
    { key: "balance", className: "transaction-history-col-balance", width: w.balance },
  ];
  if (includeDescription) {
    cols.push({ key: "description", className: "transaction-history-col-description", width: w.description });
  }
  cols.push(
    { key: "remark", className: "transaction-history-col-remark", width: w.remark },
    { key: "created", className: "transaction-history-col-created", width: w.created },
  );
  return cols;
}

export function transactionHistoryTableMinWidth({ includeDescription = true } = {}) {
  const sum = transactionHistoryColumnList({ includeDescription }).reduce((acc, col) => acc + col.width, 0);
  return Math.max(sum, TRANSACTION_HISTORY_TABLE_MIN_WIDTH);
}
