import { getHistoryRemark, toUpperDisplay, formatRateForHistoryDisplay } from "../lib/transactionFormat.js";
import TransactionHistoryEllipsisCell from "./TransactionHistoryEllipsisCell.jsx";
import TransactionWinLossCell from "./TransactionWinLossCell.jsx";

function HistoryTableColgroup({ showDescriptionColumn }) {
  if (showDescriptionColumn) {
    return (
      <colgroup>
        <col className="transaction-history-col-date" />
        <col className="transaction-history-col-product" />
        <col className="transaction-history-col-currency" />
        <col className="transaction-history-col-rate" />
        <col className="transaction-history-col-winloss" />
        <col className="transaction-history-col-crdr" />
        <col className="transaction-history-col-balance" />
        <col className="transaction-history-col-description" />
        <col className="transaction-history-col-remark" />
        <col className="transaction-history-col-created" />
      </colgroup>
    );
  }

  return (
    <colgroup>
      <col className="transaction-history-col-date" />
      <col className="transaction-history-col-product" />
      <col className="transaction-history-col-currency" />
      <col className="transaction-history-col-rate" />
      <col className="transaction-history-col-winloss" />
      <col className="transaction-history-col-crdr" />
      <col className="transaction-history-col-balance" />
      <col className="transaction-history-col-remark" />
      <col className="transaction-history-col-created" />
    </colgroup>
  );
}

export default function TransactionHistoryTable({ rows, histMoney, showDescriptionColumn, m }) {
  const tableClass = showDescriptionColumn
    ? "transaction-history-table--with-desc"
    : "transaction-history-table--no-desc";

  return (
    <div className="transaction-history-table-frame transaction-history-report-scroll" role="region" aria-label="Payment History">
      <table className={`transaction-table transaction-history-report-table ${tableClass}`}>
        <HistoryTableColgroup showDescriptionColumn={showDescriptionColumn} />
        <thead>
          <tr className="transaction-table-header">
            <th scope="col" className="transaction-history-col-date">
              {m.date}
            </th>
            <th scope="col" className="transaction-history-col-product">
              {m.idProduct}
            </th>
            <th scope="col" className="transaction-history-col-currency">
              {m.currency}
            </th>
            <th scope="col" className="transaction-history-col-rate">
              {m.rate}
            </th>
            <th scope="col" className="transaction-history-col-winloss">
              {m.winLossTable}
            </th>
            <th scope="col" className="transaction-history-col-crdr">
              {m.crDrTable}
            </th>
            <th scope="col" className="transaction-history-col-balance">
              {m.balanceTable}
            </th>
            {showDescriptionColumn ? (
              <th scope="col" className="transaction-history-col-description">
                {m.description}
              </th>
            ) : null}
            <th scope="col" className="transaction-history-col-remark">
              {m.remark}
            </th>
            <th scope="col" className="transaction-history-col-created">
              {m.createdBy}
            </th>
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
                <td className="transaction-history-col-date">
                  <TransactionHistoryEllipsisCell value={r.date || "-"} />
                </td>
                <td className="transaction-history-col-product">
                  <TransactionHistoryEllipsisCell value={idProductDisplay} />
                </td>
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
                  <td className="transaction-history-col-description text-uppercase">
                    <TransactionHistoryEllipsisCell value={toUpperDisplay(r.description)} />
                  </td>
                ) : null}
                <td className="transaction-history-col-remark text-uppercase">
                  <TransactionHistoryEllipsisCell value={getHistoryRemark(r)} />
                </td>
                <td className="transaction-history-col-created">
                  <TransactionHistoryEllipsisCell value={createdByDisplay} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
