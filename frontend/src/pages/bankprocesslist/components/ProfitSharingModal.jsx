import React from "react";
import BankSearchableAccountPick from "./BankSearchableAccountPick.jsx";

export default function ProfitSharingModal({
  profitShareRows,
  setProfitShareRows,
  accounts,
  onConfirm,
  onClose,
  onOpenAddAccountForField,
}) {
  const addRow = () => {
    setProfitShareRows((prev) => [...prev, { accountId: "", accountLabel: "", amount: "" }]);
  };

  const removeRow = (idx) => {
    setProfitShareRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div id="profitSharingModal" className="modal" style={{ display: "block" }}>
      <div className="modal-content" style={{ maxWidth: "628px" }}>
        <div className="modal-header">
          <h2>Add Profit Sharing</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <div className="bank-form" style={{ display: "block" }}>
            <div id="profitSharingRowsContainer">
              {profitShareRows.map((row, idx) => (
                <div key={`ps-${idx}`} className="form-row bank-row-two-cols profit-sharing-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Account</label>
                    <div className="account-select-with-buttons">
                      <BankSearchableAccountPick
                        value={row.accountId}
                        onChange={(id) => {
                          const acc = accounts.find((a) => String(a.id) === String(id));
                          setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, accountId: id, accountLabel: acc?.account_id || "" } : r)));
                        }}
                        accounts={accounts}
                        disabled={false}
                      />
                      <button type="button" className="bank-add-btn" title="Add New Account" onClick={() => onOpenAddAccountForField({ type: "profitRow", index: idx })}>+</button>
                    </div>
                  </div>
                  <div className="form-group" style={{ width: 120 }}>
                    <label>Amount</label>
                    <input type="number" className="bank-input profit-sharing-amount" placeholder="Amount" step="0.01" min="0" value={row.amount} onChange={(e) => setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)))} />
                  </div>
                  <div className="form-group profit-sharing-delete-cell">
                    <button type="button" className="profit-sharing-delete-row-btn" onClick={() => removeRow(idx)} aria-label="Remove row">×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="profit-sharing-add-row-wrap" style={{ marginTop: 10 }}>
              <button type="button" className="bank-add-btn" title="Add another Account &amp; Amount" onClick={addRow}>+</button>
            </div>
            <div className="form-actions bank-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-save" onClick={onConfirm}>Add</button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
