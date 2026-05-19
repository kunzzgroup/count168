import { Link } from "react-router-dom";
import CapturedReferenceTable from "./CapturedReferenceTable.jsx";
import SummaryTableRow from "./SummaryTableRow.jsx";

export default function SummaryTable({ tableData, rows = [], visible = false }) {
  if (!visible || !tableData) return null;

  return (
    <>
      <div className="table-wrapper">
        <table className="summary-table" id="summaryTable">
          <thead>
            <tr>
              <th className="id-product-header">Id Product</th>
              <th>Account</th>
              <th />
              <th>Currency</th>
              <th>Formula</th>
              <th>Source</th>
              <th>Rate</th>
              <th>Rate Value</th>
              <th>Processed Amount</th>
              <th>Skip</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody id="summaryTableBody">
            {rows.map((row) => (
              <SummaryTableRow
                key={row.key}
                rowKey={row.key}
                idProduct={row.idProduct}
                rowIndex={row.rowIndex}
                productType={row.productType}
                parentIdProduct={row.parentIdProduct}
                parentRowIndex={row.parentRowIndex}
              />
            ))}
          </tbody>
          <tfoot>
            <tr id="summaryTotalRow">
              <td colSpan={8} className="summary-total-label" />
              <td id="summaryTotalAmount">0.00</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <CapturedReferenceTable tableData={tableData} />
    </>
  );
}

export function SummaryEmptyState() {
  return (
    <div className="summary-table-container empty-state-container">
      <div className="table-header">
        <span>No Captured Data Available</span>
      </div>
      <div className="empty-state">
        <p>
          No captured data found. Please go back to the Data Capture page and submit some data first.
        </p>
        <Link to="/datacapture" className="btn btn-save">
          Go to Data Capture
        </Link>
      </div>
    </div>
  );
}
