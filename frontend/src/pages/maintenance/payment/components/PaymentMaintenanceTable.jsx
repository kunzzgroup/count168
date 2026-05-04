import { formatAmount, stripBankProcessDescriptionPrefix } from "../paymentMaintenanceLogic.js";
import { useEffect, useRef } from "react";

export default function PaymentMaintenanceTable({ 
  data, 
  loading, 
  selectedIds, 
  toggleSelect, 
  toggleSelectAll, 
  selectAll 
}) {
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      const selectable = data.filter(r => !(r.is_deleted === 1 || r.is_deleted === '1' || r.is_deleted === true));
      const checked = selectable.filter(r => selectedIds.includes(r.transaction_id));
      
      selectAllRef.current.indeterminate = checked.length > 0 && checked.length < selectable.length;
    }
  }, [selectedIds, data]);

  if (loading) {
    return (
      <div className="maintenance-list-container" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>No.</th><th>Created At</th><th>Account(To)</th><th>Account(From)</th><th className="maintenance-header-amount">Amount</th><th>Description</th><th>Remark</th><th>Submitter</th><th>Deleter</th>
              <th className="maintenance-select-all-header">
                <input type="checkbox" className="maintenance-row-checkbox" disabled />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="maintenance-table-cell" colSpan="10" style={{ textAlign: "center", padding: "20px" }}>
                Loading...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>No data found. Please adjust your search criteria and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="maintenance-list-container" style={{ display: "block" }}>
      <table className="maintenance-table">
        <thead>
          <tr>
            <th>No.</th><th>Created At</th><th>Account(To)</th><th>Account(From)</th><th className="maintenance-header-amount">Amount</th><th>Description</th><th>Remark</th><th>Submitter</th><th>Deleter</th>
            <th className="maintenance-select-all-header">
              <input 
                type="checkbox" 
                id="select_all_payment"
                ref={selectAllRef}
                className="maintenance-row-checkbox" 
                checked={selectAll}
                onChange={toggleSelectAll}
                title="Select All" 
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const isDeleted = row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true;
            const deletedBy = row.deleted_by || '';
            const dtsDeleted = row.dts_deleted || '';
            const deletedDisplay = isDeleted && deletedBy
                ? `${deletedBy} (${dtsDeleted || '-'})`
                : (isDeleted ? (dtsDeleted || '-') : '-');
            
            const rawDescription = row.description || '';
            const displayDescription = stripBankProcessDescriptionPrefix(rawDescription);
            
            return (
              <tr 
                key={row.transaction_id || index} 
                className={`maintenance-row ${isDeleted ? "maintenance-row-deleted" : ""}`}
              >
                <td className="maintenance-table-cell">{index + 1}</td>
                <td className="maintenance-table-cell">{row.dts_created || '-'}</td>
                <td className="maintenance-table-cell">{row.account || '-'}</td>
                <td className="maintenance-table-cell">{row.from_account && row.from_account !== '-' ? row.from_account : '-'}</td>
                <td className="maintenance-table-cell maintenance-cell-amount">{row.currency || ''} {formatAmount(row.amount)}</td>
                <td className="maintenance-table-cell" title={displayDescription}>{displayDescription || '-'}</td>
                <td className="maintenance-table-cell">{row.remark || '-'}</td>
                <td className="maintenance-table-cell">{row.created_by || '-'}</td>
                <td className="maintenance-table-cell">{deletedDisplay}</td>
                <td className="maintenance-table-cell maintenance-cell-checkbox">
                  <input 
                    type="checkbox" 
                    className="maintenance-row-checkbox" 
                    checked={selectedIds.includes(row.transaction_id)}
                    onChange={() => toggleSelect(row.transaction_id)}
                    disabled={isDeleted}
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
