import { formatAmount, toUpperDisplay } from "../bankprocessMaintenanceLogic.js";

export default function BankprocessMaintenanceTable({
  loading,
  rows,
  hasSearched,
  selectedIds,
  onToggleRow,
  selectAll,
  onToggleSelectAll,
}) {
  if (loading) {
    return (
      <div className="maintenance-list-container" id="tableContainer" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>No.</th><th>Dts Created</th><th>Account</th><th>From</th><th className="maintenance-header-amount">Amount</th><th>Description</th><th>Remark</th><th>Submitted By</th><th className="maintenance-select-all-header"><input type="checkbox" className="maintenance-checkbox" disabled /></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="maintenance-table-cell" colSpan="9" style={{ textAlign: "center", padding: "20px" }}>
                Loading...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (!loading && hasSearched && rows.length === 0) {
    return (
      <div className="empty-state-container" id="emptyState" style={{ display: "block" }}>
        <div className="empty-state">
          <p>No bank process transactions found. Please adjust your search criteria and try again.</p>
        </div>
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <div className="maintenance-list-container" id="tableContainer" style={{ display: "block" }}>
      <table className="maintenance-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Dts Created</th>
            <th>Account</th>
            <th>From</th>
            <th className="maintenance-header-amount">Amount</th>
            <th>Description</th>
            <th>Remark</th>
            <th>Submitted By</th>
            <th className="maintenance-select-all-header">
              <input
                type="checkbox"
                id="select_all_bankprocess"
                className="maintenance-checkbox"
                title="Select All"
                checked={selectAll}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
              />
            </th>
          </tr>
        </thead>
        <tbody id="dataTableBody">
          {rows.map((row, index) => {
            const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
            const transactionId = row.transaction_id;
            const checked = selectedIds.includes(transactionId);
            const currency = row.currency ? `${row.currency} ` : "";
            return (
              <tr key={transactionId || `${index}-${row.dts_created || "row"}`} className={`maintenance-row ${isDeleted ? "maintenance-row-deleted" : ""}`}>
                <td className="maintenance-table-cell">{index + 1}</td>
                <td className="maintenance-table-cell">{row.dts_created || "-"}</td>
                <td className="maintenance-table-cell">{row.account || "-"}</td>
                <td className="maintenance-table-cell">{toUpperDisplay(row.from_account)}</td>
                <td className="maintenance-table-cell maintenance-cell-currency-amount">
                  {row.amount !== null && row.amount !== undefined && row.amount !== "" ? `${currency}${formatAmount(row.amount)}` : "-"}
                </td>
                <td className="maintenance-table-cell">{row.description || "-"}</td>
                <td className="maintenance-table-cell text-uppercase">{toUpperDisplay(row.remark)}</td>
                <td className="maintenance-table-cell">{row.created_by || "-"}</td>
                <td className="maintenance-table-cell maintenance-cell-checkbox">
                  <input
                    type="checkbox"
                    className="maintenance-row-checkbox"
                    checked={checked}
                    disabled={isDeleted}
                    title={isDeleted ? "Already deleted" : ""}
                    onChange={() => onToggleRow(transactionId)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
