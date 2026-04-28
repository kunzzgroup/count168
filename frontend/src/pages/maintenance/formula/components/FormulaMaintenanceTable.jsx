import { useState, useEffect, useRef } from "react";
import { toUpperDisplay, INPUT_METHOD_OPTIONS } from "../formulaMaintenanceLogic.js";

export default function FormulaMaintenanceTable({
  data,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSaveRow,
  accounts,
  isInitialState
}) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      const checkedCount = selectedIds.length;
      selectAllRef.current.indeterminate = checkedCount > 0 && checkedCount < data.length;
    }
  }, [selectedIds, data]);

  const handleEdit = (row) => {
    setEditingId(row.id);
    setEditForm({
      account_id: row.account_id || "",
      source_columns: row.source_ref != null ? String(row.source_ref) : "",
      input_method: row.input_method || "",
      formula: row.formula_edit || row.formula || "",
      description: row.description || ""
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (id) => {
    const success = await onSaveRow(id, editForm);
    if (success) {
      setEditingId(null);
      setEditForm({});
    }
  };

  if (isInitialState) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>Use search or filters to view data.</p>
        </div>
      </div>
    );
  }

  if (loading && data.length === 0) {
    return (
      <div className="maintenance-list-container" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>No.</th><th>Process</th><th>Account</th><th>Cur</th><th>Source</th><th>Product</th><th>Input Method</th><th>Formula</th><th>Description</th><th className="maintenance-select-all-header"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="10" style={{ textAlign: "center", padding: "20px" }}>Loading...</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (!loading && data.length === 0) {
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
            <th>No.</th>
            <th>Process</th>
            <th>Account</th>
            <th>Cur</th>
            <th>Source</th>
            <th>Product</th>
            <th>Input Method</th>
            <th>Formula</th>
            <th>Description</th>
            <th className="maintenance-select-all-header" style={{ textAlign: "center" }}>
              <input 
                type="checkbox" 
                ref={selectAllRef}
                className="maintenance-checkbox"
                checked={data.length > 0 && selectedIds.length === data.length}
                onChange={onToggleSelectAll}
                title="Select All"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const isEditing = editingId === row.id;
            
            return (
              <tr key={row.id}>
                <td>{row.no}</td>
                <td>{toUpperDisplay(row.process)}</td>
                
                {/* Account Cell */}
                <td>
                  {isEditing ? (
                    <select 
                      className="account-select" 
                      value={editForm.account_id}
                      onChange={(e) => setEditForm({...editForm, account_id: e.target.value})}
                      style={{ display: "block", width: "100%" }}
                    >
                      <option value="">--Select Account--</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.display_text}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="account-display">{toUpperDisplay(row.account)}</span>
                  )}
                </td>

                <td>{toUpperDisplay(row.currency)}</td>

                {/* Source Cell */}
                <td>
                  {isEditing ? (
                    <input 
                      type="text" 
                      className="source-input" 
                      value={editForm.source_columns}
                      onChange={(e) => setEditForm({...editForm, source_columns: e.target.value})}
                      style={{ display: "block", width: "100%" }}
                    />
                  ) : (
                    <span className="source-display" title={row.source}>{toUpperDisplay(row.source)}</span>
                  )}
                </td>

                <td>{toUpperDisplay(row.product)}</td>

                {/* Input Method Cell */}
                <td>
                  {isEditing ? (
                    <select 
                      className="input-method-select"
                      value={editForm.input_method}
                      onChange={(e) => setEditForm({...editForm, input_method: e.target.value})}
                      style={{ display: "block", width: "100%" }}
                    >
                      {INPUT_METHOD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.text}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="input-method-display" title={row.input_method}>{toUpperDisplay(row.input_method)}</span>
                  )}
                </td>

                {/* Formula Cell */}
                <td>
                  {isEditing ? (
                    <input 
                      type="text" 
                      className="formula-input" 
                      value={editForm.formula}
                      onChange={(e) => setEditForm({...editForm, formula: e.target.value})}
                      style={{ display: "block", width: "100%" }}
                    />
                  ) : (
                    <span className="formula-display" style={{ wordBreak: "break-word" }} title={row.formula}>{toUpperDisplay(row.formula)}</span>
                  )}
                </td>

                {/* Description Cell */}
                <td>
                  {isEditing ? (
                    <input 
                      type="text" 
                      className="description-input" 
                      value={editForm.description}
                      onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                      style={{ display: "block", width: "100%" }}
                    />
                  ) : (
                    <span className="description-display" style={{ wordBreak: "break-word" }}>{toUpperDisplay(row.description)}</span>
                  )}
                </td>

                {/* Actions Cell */}
                <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                    {isEditing ? (
                      <>
                        <button className="maintenance-edit-btn" onClick={() => handleSave(row.id)} title="Save">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </button>
                        <button className="maintenance-cancel-btn" onClick={handleCancel} title="Cancel">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="maintenance-edit-btn" onClick={() => handleEdit(row)} title="Edit">
                          <img src="images/edit.svg" alt="Edit" className="edit-icon" style={{ width: "16px", height: "16px" }} />
                        </button>
                        <input 
                          type="checkbox" 
                          className="data-capture-row-checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => onToggleSelect(row.id)}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
