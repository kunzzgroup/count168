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
  roles,
  currencyInput,
  setCurrencyInput,
  onCreateCurrency
}) {
  if (!open) return null;

  const filteredAccounts = accounts.filter(a => {
    const text = `${a.account_id || ""} ${a.name || ""}`.toLowerCase();
    const matchesQ = !settingSearch || text.includes(settingSearch.toLowerCase());
    const matchesRole = !settingRole || String(a.role).toLowerCase().trim() === settingRole.toLowerCase().trim();
    return matchesQ && matchesRole;
  });

  return (
    <div id="currencySettingModal" className="currency-fullscreen-modal" style={{ display: "block" }}>
      <div className="currency-fullscreen-modal-content">
        {/* Top Header Bar */}
        <div className="currency-fullscreen-modal-header-bar">
          <h2>Currency Setting</h2>
          <button type="button" className="currency-btn-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back
          </button>
        </div>

        {/* Body */}
        <div className="currency-fullscreen-modal-body">
          {/* Left Panel: Currency Management */}
          <div className="currency-left-panel">
            <div className="currency-setting-add-row-stacked">
              <label>Add Currency :</label>
              <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                <input
                  type="text"
                  className="currency-setting-input"
                  placeholder="Please enter new currency"
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(toUpper(e.target.value))}
                />
                <button
                  type="button"
                  className="account-btn account-btn-add currency-setting-add-btn"
                  onClick={onCreateCurrency}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="currency-setting-divider"></div>

            <div className="currency-setting-list-row-stacked">
              <label>Currency :</label>
              <div className="currency-setting-pill-list">
                {currencies.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`currency-setting-pill ${settingCurrencyId === Number(c.id) ? "active" : ""}`}
                    onClick={() => {
                      const id = Number(c.id);
                      setSettingCurrencyId(id);
                      onLoadCurrencyLinks(id);
                    }}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Accounts */}
          <div className="currency-right-panel">
            <div className="currency-setting-filter-row">
              <div className="currency-setting-search-wrap">
                <svg className="currency-setting-search-icon" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  className="currency-setting-search-input"
                  placeholder="Search Bar"
                  value={settingSearch}
                  onChange={(e) => setSettingSearch(e.target.value)}
                />
              </div>
              <div className="currency-setting-role-filter">
                <select
                  className="currency-setting-select"
                  value={settingRole}
                  onChange={(e) => setSettingRole(e.target.value)}
                >
                  <option value="">Filter Row</option>
                  {roles.map(r => (
                    <option key={r} value={r}>{toUpper(r)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="currency-setting-selectall-row">
              <button
                type="button"
                className="account-btn currency-setting-selectall-btn"
                onClick={() => {
                  const allIds = filteredAccounts.map(a => Number(a.id));
                  const allSelected = allIds.every(id => settingLinked.has(id));
                  setSettingLinked(prev => {
                    const n = new Set(prev);
                    if (allSelected) {
                      allIds.forEach(id => n.delete(id));
                    } else {
                      allIds.forEach(id => n.add(id));
                    }
                    return n;
                  });
                }}
              >
                Select All
              </button>
              <span className="currency-setting-selected-count">{settingLinked.size} selected</span>
            </div>

            <div className="currency-setting-account-list">
              {filteredAccounts.map(a => (
                <div key={a.id} className="account-item-compact">
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
                  <label className="account-label">{toUpper(a.account_id)}</label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fixed Bottom Bar */}
        <div className="currency-fullscreen-bottom-bar">
          <button type="button" className="account-btn account-btn-save currency-setting-submit-btn" onClick={onSave}>
            Save
          </button>
          <button type="button" className="account-btn account-btn-cancel currency-setting-cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

