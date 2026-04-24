import React from "react";
import { toUpper } from "../accountLogic.js";

export default function CurrencySettingModal({
  open,
  onClose,
  currencies,
  settingCurrencyId,
  setSettingCurrencyId,
  settingLinked,
  setSettingLinked,
  settingSearch,
  setSettingSearch,
  settingRole,
  setSettingRole,
  onLoadCurrencyLinks,
  onSave,
  accounts,
  roles
}) {
  if (!open) return null;

  const filteredAccounts = accounts.filter(a => {
    const text = `${a.account_id || ""} ${a.name || ""}`.toLowerCase();
    const matchesQ = !settingSearch || text.includes(settingSearch.toLowerCase());
    const matchesRole = !settingRole || String(a.role).toLowerCase().trim() === settingRole.toLowerCase().trim();
    return matchesQ && matchesRole;
  });

  return (
    <div className="account-modal" style={{ display: "block" }}>
      <div className="account-modal-content" style={{ maxWidth: 800 }}>
        <div className="account-modal-header">
          <h2>Currency Setting</h2>
          <span className="account-close" onClick={onClose}>&times;</span>
        </div>
        <div className="account-modal-body">
          <div style={{ marginBottom: 20, display: "flex", gap: 15, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 5 }}>Target Currency</label>
              <select 
                style={{ width: "100%", padding: "8px" }} 
                value={settingCurrencyId || ""} 
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSettingCurrencyId(id);
                  onLoadCurrencyLinks(id);
                }}
              >
                <option value="">Select Currency</option>
                {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 5 }}>Search Account</label>
              <input 
                style={{ width: "100%", padding: "8px" }} 
                value={settingSearch} 
                onChange={(e) => setSettingSearch(e.target.value)} 
                placeholder="ID or Name"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 5 }}>Role Filter</label>
              <select 
                style={{ width: "100%", padding: "8px" }} 
                value={settingRole} 
                onChange={(e) => setSettingRole(e.target.value)}
              >
                <option value="">All Roles</option>
                {roles.map(r => <option key={r} value={r}>{toUpper(r)}</option>)}
              </select>
            </div>
          </div>

          <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #eee", padding: 10 }}>
            {!settingCurrencyId ? (
              <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Please select a currency first</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                {filteredAccounts.map(a => (
                  <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "#f9f9f9", borderRadius: 4, cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={settingLinked.has(Number(a.id))}
                      onChange={(e) => {
                        const id = Number(a.id);
                        setSettingLinked(prev => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(id); else n.delete(id);
                          return n;
                        });
                      }}
                    />
                    <span style={{ fontSize: 13 }}>{toUpper(a.account_id)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="account-modal-footer" style={{ padding: "15px 20px", textAlign: "right" }}>
          <button className="account-btn account-btn-save" onClick={onSave} disabled={!settingCurrencyId}>Save Settings</button>
          <button className="account-btn account-btn-cancel" onClick={onClose} style={{ marginLeft: 10 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
