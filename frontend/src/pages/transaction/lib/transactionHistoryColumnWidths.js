/** Transaction History 固定列宽（px） */
export const TRANSACTION_HISTORY_COL_PX = {
  date: 100,
  product: 180,
  currency: 88,
  rate: 80,
  winLoss: 100,
  crDr: 100,
  balance: 120,
  description: 280,
  remark: 180,
  created: 120,
};

export const TRANSACTION_HISTORY_TABLE_MIN_WIDTH = 1350;

export function historyColumnDefs(includeDescription) {
  const c = TRANSACTION_HISTORY_COL_PX;
  const cols = [
    { key: "date", className: "transaction-history-col-date", width: c.date },
    { key: "product", className: "transaction-history-col-product", width: c.product },
    { key: "currency", className: "transaction-history-col-currency", width: c.currency },
    { key: "rate", className: "transaction-history-col-rate", width: c.rate },
    { key: "winLoss", className: "transaction-history-col-winloss", width: c.winLoss },
    { key: "crDr", className: "transaction-history-col-crdr", width: c.crDr },
    { key: "balance", className: "transaction-history-col-balance", width: c.balance },
  ];
  if (includeDescription) {
    cols.push({
      key: "description",
      className: "transaction-history-col-description",
      width: c.description,
      flex: true,
    });
  }
  cols.push(
    { key: "remark", className: "transaction-history-col-remark", width: c.remark },
    { key: "created", className: "transaction-history-col-created", width: c.created },
  );
  return cols;
}
