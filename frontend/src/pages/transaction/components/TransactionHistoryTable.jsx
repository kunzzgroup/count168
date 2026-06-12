import { getHistoryRemark, toUpperDisplay, formatRateForHistoryDisplay } from "../lib/transactionFormat.js";
import TransactionWinLossCell from "./TransactionWinLossCell.jsx";

export default function TransactionHistoryTable({ rows, histMoney, showDescriptionColumn, m }) {
  return (
    <div className="transaction-history-table-frame">
      <table
        className={`transaction-table ${showDescriptionColumn ? "transaction-history-table--with-desc" : "transaction-history-table--no-desc"}`}
      >
        <thead>
          <tr className="transaction-table-header">
            <th className="transaction-history-col-date">{m.date}</th>
            <th className="transaction-history-col-product">{m.idProduct}</th>
            <th className="transaction-history-col-currency">{m.currency}</th>
            <th className="transaction-history-col-rate">{m.rate}</th>
            <th className="transaction-history-col-winloss">{m.winLossTable}</th>
            <th className="transaction-history-col-crdr">{m.crDrTable}</th>
            <th className="transaction-history-col-balance">{m.balanceTable}</th>
            {showDescriptionColumn ? (
              <th className="transaction-history-col-description">{m.description}</th>
            ) : null}
            <th className="transaction-history-col-remark">{m.remark}</th>
            <th className="transaction-history-col-created">{m.createdBy}</th>
          </tr>
        </thead>
        <tbody id="modal_tbody">
          {rows.map((r, idx) => {
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
                <td className="transaction-history-col-rate">
                  {r.rate && r.rate !== "-" ? formatRateForHistoryDisplay(r.rate) : "-"}
                </td>
                <td className="transaction-history-col-winloss">
                  <TransactionWinLossCell value={r.win_loss} formatMoney={histMoney} />
                </td>
                <td className="transaction-history-col-crdr">
                  <TransactionWinLossCell value={r.cr_dr} formatMoney={histMoney} />
                </td>
                <td className="transaction-history-col-balance">
                  <TransactionWinLossCell value={r.balance} formatMoney={histMoney} />
                </td>
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
  );
}
