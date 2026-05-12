import { getHistoryRemark, toUpperDisplay } from "../transactionFormat.js";

export default function TransactionHistoryModal({
  history,
  setHistory,
  histMoney,
  showDescriptionColumn,
}) {
  return (
    <div id="historyModal" className="transaction-modal" style={{ display: history.open ? "flex" : "none" }}>
      <div className="transaction-modal-content transaction-history-modal">
        <div className="transaction-modal-header">
          <h3 id="modal_title">{history.title}</h3>
          <button
            type="button"
            id="modal_close"
            className="transaction-modal-close"
            onClick={() => setHistory((h) => ({ ...h, open: false }))}
          >
            ×
          </button>
        </div>
        <div className="transaction-modal-body" style={{ position: "relative" }}>
          {history.loading ? (
            <div
              className="transaction-tables-loading"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.75)",
                zIndex: 2,
              }}
              aria-live="polite"
            >
              Loading history…
            </div>
          ) : null}
          <div className="transaction-history-table-frame">
            <table className="transaction-table">
              <thead>
                <tr className="transaction-table-header">
                  <th className="transaction-history-col-date">Date</th>
                  <th className="transaction-history-col-product">Id Product</th>
                  <th className="transaction-history-col-currency">Currency</th>
                  <th className="transaction-history-col-rate">Rate</th>
                  <th className="transaction-history-col-winloss">Win/Loss</th>
                  <th className="transaction-history-col-crdr">Cr/Dr</th>
                  <th className="transaction-history-col-balance">Balance</th>
                  {showDescriptionColumn ? (
                    <th className="transaction-history-col-description">Description</th>
                  ) : null}
                  <th className="transaction-history-col-remark">Remark</th>
                  <th className="transaction-history-col-created">Created by</th>
                </tr>
              </thead>
              <tbody id="modal_tbody">
                {history.rows.map((r, idx) => {
                  const isBf = r.row_type === "bf";
                  const idProductDisplay = r.is_bank_process_transaction ? r.card_owner || "-" : r.product || "-";
                  const createdRaw = r.created_by;
                  const createdByDisplay =
                    createdRaw === null ||
                    createdRaw === undefined ||
                    String(createdRaw).trim() === "" ||
                    String(createdRaw).toLowerCase() === "null"
                      ? "-"
                      : String(createdRaw);
                  return (
                    <tr
                      key={r.id ?? `${idx}-${r.date || ""}-${r.balance || ""}`}
                      className={isBf ? "transaction-bf-row transaction-history-bf-row" : "transaction-table-row"}
                    >
                      <td className="transaction-history-col-date">{r.date || "-"}</td>
                      <td className="transaction-history-col-product">{String(idProductDisplay)}</td>
                      <td className="transaction-history-col-currency">{r.currency || "-"}</td>
                      <td className="transaction-history-col-rate">{r.rate || "-"}</td>
                      <td className="transaction-history-col-winloss">{histMoney(r.win_loss)}</td>
                      <td className="transaction-history-col-crdr">{histMoney(r.cr_dr)}</td>
                      <td className="transaction-history-col-balance">{histMoney(r.balance)}</td>
                      {showDescriptionColumn ? (
                        <td className="transaction-history-col-description text-uppercase">{toUpperDisplay(r.description)}</td>
                      ) : null}
                      <td className="transaction-history-col-remark text-uppercase">{getHistoryRemark(r)}</td>
                      <td className="transaction-history-col-created">{createdByDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
