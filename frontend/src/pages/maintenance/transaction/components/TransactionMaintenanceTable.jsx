import { formatAmount } from "../transactionMaintenanceLogic.js";

export default function TransactionMaintenanceTable({ data, loading }) {
  if (loading) {
    return (
      <div className="maintenance-list-container" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>No.</th><th>Created At</th><th>Process</th><th>Id_Product</th><th>Account</th><th>Description</th><th>Remark</th><th>Percent</th><th>Currency</th><th>Rate</th><th>Cr</th><th>Dr</th><th>Submitter</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="maintenance-table-cell" colSpan="13" style={{ textAlign: "center", padding: "20px" }}>
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
            <th>No.</th><th>Created At</th><th>Process</th><th>Id_Product</th><th>Account</th><th>Description</th><th>Remark</th><th>Percent</th><th>Currency</th><th>Rate</th><th>Cr</th><th>Dr</th><th>Submitter</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const isDeleted = row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true;
            
            return (
              <tr 
                key={row.transaction_id || index} 
                className={`maintenance-row ${isDeleted ? "maintenance-row-deleted" : ""}`}
              >
                <td className="maintenance-table-cell">{row.no || index + 1}</td>
                <td className="maintenance-table-cell">{row.dts_created || '-'}</td>
                <td className="maintenance-table-cell">{row.process || '-'}</td>
                <td className="maintenance-table-cell">{row.id_product || '-'}</td>
                <td className="maintenance-table-cell">{row.account || '-'}</td>
                <td className="maintenance-table-cell">{row.description || '-'}</td>
                <td className="maintenance-table-cell">{row.remark || '-'}</td>
                <td className="maintenance-table-cell">{row.percent || '-'}</td>
                <td className="maintenance-table-cell maintenance-cell-currency">{row.currency || '-'}</td>
                <td className="maintenance-table-cell">{row.rate || '-'}</td>
                <td className="maintenance-table-cell">{formatAmount(row.cr)}</td>
                <td className="maintenance-table-cell">{formatAmount(row.dr)}</td>
                <td className="maintenance-table-cell">{row.created_by || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
