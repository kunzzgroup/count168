import React from "react";

export default function AccountingDueModal({
  accountingRows,
  accountingLoading,
  accountingSelected,
  setAccountingSelected,
  accountingDeleteSelected,
  setAccountingDeleteSelected,
  onPostToTransaction,
  onDismissRows,
  onClose,
}) {
  const postableRows = accountingRows.filter((r) => !r.already_posted_today);
  const postAllChecked = postableRows.length > 0 && postableRows.every((r) => accountingSelected.has(Number(r.id)));
  const deleteAllChecked = accountingRows.length > 0 && accountingRows.every((r) => accountingDeleteSelected.has(Number(r.id)));

  return (
    <div id="processAccountingDueModal" className="modal" style={{ display: "block" }}>
      <div className="modal-content accounting-due-modal-content">
        <div className="modal-header">
          <h2>
            Accounting Due
            <span className="process-accounting-inbox-badge">{postableRows.length}</span>
          </h2>
          <div className="modal-header-actions">
            <span className="close" onClick={onClose} role="presentation">&times;</span>
          </div>
        </div>
        <div className="modal-body">
          <div className="process-accounting-inbox-table-wrap">
            <table className="process-accounting-inbox-table">
              <thead>
                <tr>
                  <th style={{ width: "36px" }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      className="process-accounting-inbox-cb"
                      checked={postAllChecked}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAccountingSelected((prev) => {
                          const next = new Set(prev);
                          postableRows.forEach((r) => {
                            const id = Number(r.id);
                            if (checked) next.add(id);
                            else next.delete(id);
                          });
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th>No</th>
                  <th>Start Date</th>
                  <th>Card Owner</th>
                  <th>Bank</th>
                  <th>Contract</th>
                  <th style={{ width: "80px" }}>
                    Delete{" "}
                    <input
                      type="checkbox"
                      title="Select all for delete"
                      className="process-accounting-inbox-delete-cb"
                      checked={deleteAllChecked}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAccountingDeleteSelected(() => {
                          if (!checked) return new Set();
                          return new Set(accountingRows.map((r) => Number(r.id)));
                        });
                      }}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {accountingLoading && <tr><td colSpan={7}>Loading...</td></tr>}
                {!accountingLoading && accountingRows.length === 0 && <tr><td colSpan={7}>No process due for accounting today.</td></tr>}
                {!accountingLoading && accountingRows.map((r, idx) => {
                  const id = Number(r.id);
                  const checked = accountingSelected.has(id);
                  const delChecked = accountingDeleteSelected.has(id);
                  return (
                    <tr key={`${id}-${idx}`} className={r.already_posted_today ? "process-accounting-inbox-row-posted" : ""}>
                      <td><input type="checkbox" disabled={!!r.already_posted_today} checked={checked && !r.already_posted_today} onChange={(e) => setAccountingSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(id); else n.delete(id); return n; })} /></td>
                      <td>{idx + 1}</td>
                      <td>{r.start_date || r.day_start || "-"}</td>
                      <td>{r.card_owner || r.name || r.supplier || "-"}</td>
                      <td>{r.bank || "-"}</td>
                      <td>{r.contract || "-"}</td>
                      <td><input type="checkbox" checked={delChecked} onChange={(e) => setAccountingDeleteSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(id); else n.delete(id); return n; })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="process-accounting-inbox-actions">
            <button type="button" className="btn btn-primary" onClick={onPostToTransaction} disabled={accountingLoading || accountingSelected.size === 0}>Transaction</button>
            <button type="button" className="btn btn-delete" onClick={onDismissRows} disabled={accountingLoading || accountingDeleteSelected.size === 0}>Delete</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
