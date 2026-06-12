import {
  transactionHistoryColumnList,
  transactionHistoryTableMinWidth,
} from "../../../components/report/transactionHistoryColumnWidths.js";
import AccountingReportTable from "../../../components/report/AccountingReportTable.jsx";
import { getHistoryRemark, toUpperDisplay, formatRateForHistoryDisplay } from "../lib/transactionFormat.js";
import TransactionWinLossCell from "./TransactionWinLossCell.jsx";

function HistoryTableColgroup({ showDescriptionColumn }) {
  const columns = transactionHistoryColumnList({ includeDescription: showDescriptionColumn });
  return (
    <colgroup>
      {columns.map((col) => (
        <col key={col.key} className={col.className} style={{ width: `${col.width}px` }} />
      ))}
    </colgroup>
  );
}

export default function TransactionHistoryTable({ rows, histMoney, showDescriptionColumn, m }) {
  const tableClass = showDescriptionColumn
    ? "transaction-history-table--with-desc transaction-history-report-table transaction-table"
    : "transaction-history-table--no-desc transaction-history-report-table transaction-table";

  const minWidth = transactionHistoryTableMinWidth({ includeDescription: showDescriptionColumn });

  const thead = (
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
  );

  const tbody = (
    <>
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
            <td className="transaction-history-col-date ec-cell-ellipsis">{r.date || "-"}</td>
            <td className="transaction-history-col-product ec-cell-ellipsis">{String(idProductDisplay)}</td>
            <td className="transaction-history-col-currency">{r.currency || "-"}</td>
            <td className="transaction-history-col-rate">{r.rate && r.rate !== "-" ? formatRateForHistoryDisplay(r.rate) : "-"}</td>
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
              <td className="transaction-history-col-description ec-cell-ellipsis text-uppercase" title={toUpperDisplay(r.description)}>
                {toUpperDisplay(r.description)}
              </td>
            ) : null}
            <td className="transaction-history-col-remark ec-cell-ellipsis text-uppercase" title={getHistoryRemark(r)}>
              {getHistoryRemark(r)}
            </td>
            <td className="transaction-history-col-created ec-cell-ellipsis" title={createdByDisplay}>
              {createdByDisplay}
            </td>
          </tr>
        );
      })}
    </>
  );

  return (
    <AccountingReportTable
      tableClassName={tableClass}
      minWidth={minWidth}
      colgroup={<HistoryTableColgroup showDescriptionColumn={showDescriptionColumn} />}
      thead={thead}
      tbody={tbody}
      ariaLabel="Payment History"
      scrollClassName="transaction-history-table-frame transaction-history-report-scroll"
    />
  );
}
