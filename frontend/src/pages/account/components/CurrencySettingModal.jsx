import React, { useEffect, useRef, useState } from "react";
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
  onClearCurrencySelection,
  onSave,
  accounts,
  roles,
  currencyInput,
  setCurrencyInput,
  onCreateCurrency,
  t,
}) {
  const roleDropdownRef = useRef(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  useEffect(() => {
    if (!open || !roleDropdownOpen) return undefined;
    const onPointerDown = (e) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target)) {
        setRoleDropdownOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setRoleDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, roleDropdownOpen]);

  if (!open) return null;

  const roleOptions = [{ value: "", label: t("filterRow") }, ...roles.map(r => ({ value: r, label: toUpper(r) }))];
  const roleLabel = settingRole ? toUpper(settingRole) : t("filterRow");
  const selectedCurrencyMatchesList =
    settingCurrencyId != null &&
    currencies.some((c) => Number(c.id) === Number(settingCurrencyId));
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
          <h2>{t("currencySetting")}</h2>
          <button type="button" className="currency-btn-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            {t("back")}
          </button>
        </div>

        {/* Body */}
        <div className="currency-fullscreen-modal-body">
          {/* Left Panel: Currency Management */}
          <div className="currency-left-panel">
            <div className="currency-setting-add-row-stacked">
              <label>{t("addCurrency")}</label>
              <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                <input
                  type="text"
                  className="currency-setting-input"
                  placeholder={t("pleaseEnterNewCurrency")}
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(toUpper(e.target.value))}
                />
                <button
                  type="button"
                  className="account-btn account-btn-add currency-setting-add-btn"
                  onClick={onCreateCurrency}
                >
                  {t("add")}
                </button>
              </div>
            </div>

            <div className="currency-setting-divider"></div>

            <div className="currency-setting-list-row-stacked">
              <label>{t("currency")}</label>
              <div className="currency-setting-pill-list">
                {currencies.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`currency-setting-pill ${settingCurrencyId === Number(c.id) ? "active" : ""}`}
                    aria-pressed={settingCurrencyId === Number(c.id)}
                    onClick={() => {
                      const id = Number(c.id);
                      if (settingCurrencyId === id) {
                        onClearCurrencySelection();
                      } else {
                        setSettingCurrencyId(id);
                        onLoadCurrencyLinks(id);
                      }
                    }}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Accounts — match User modal account-grid / process cards */}
          <div className="currency-right-panel">
            <div className="currency-setting-filter-row">
              <div className="currency-setting-filter-left">
                <h3>{t("account")}</h3>
                <div className="currency-setting-search-wrap">
                  <svg className="currency-setting-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    className="currency-setting-search-input"
                    placeholder={t("searchByAccountOrName")}
                    value={settingSearch}
                    onChange={(e) => setSettingSearch(e.target.value)}
                  />
                </div>
                <div className={`currency-setting-role-filter${roleDropdownOpen ? " is-open" : ""}`} ref={roleDropdownRef}>
                  <button
                    type="button"
                    className="currency-setting-role-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={roleDropdownOpen}
                    onClick={() => setRoleDropdownOpen((openNow) => !openNow)}
                  >
                    <span>{roleLabel}</span>
                    <svg className="currency-setting-role-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 15l6-6 6 6" />
                    </svg>
                  </button>
                  {roleDropdownOpen ? (
                    <div className="currency-setting-role-menu" role="listbox">
                      {roleOptions.map((option) => {
                        const selected = String(settingRole || "") === String(option.value || "");
                        return (
                          <button
                            key={option.value || "all"}
                            type="button"
                            className={`currency-setting-role-option${selected ? " is-selected" : ""}`}
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setSettingRole(option.value);
                              setRoleDropdownOpen(false);
                            }}
                          >
                            <span>{option.label}</span>
                            {selected ? (
                              <svg className="currency-setting-role-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="currency-setting-selectall-row">
                <span className="currency-setting-selected-count">{t("selectedCount", { count: settingLinked.size })}</span>
                <button
                  type="button"
                  className="account-btn account-btn-add currency-setting-selectall-btn"
                  disabled={!selectedCurrencyMatchesList}
                  title={!selectedCurrencyMatchesList ? t("pleaseSelectCurrencyFirst") : undefined}
                  onClick={() => {
                    if (!selectedCurrencyMatchesList) return;
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
                  {t("selectAll")}
                </button>
              </div>
            </div>

            <div className="currency-setting-account-list account-grid account-grid--four account-grid--process">
              {filteredAccounts.map(a => (
                <label key={a.id} className="account-item-compact account-item-compact--process currency-setting-select-card">
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
                  <span className="account-label account-label--process">
                    {toUpper(a.account_id)}
                    {a.name ? <span className="account-label-desc">{a.name}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Fixed Bottom Bar */}
        <div className="currency-fullscreen-bottom-bar">
          <button
            type="button"
            className="account-btn account-btn-save currency-setting-submit-btn"
            disabled={!selectedCurrencyMatchesList}
            title={!selectedCurrencyMatchesList ? t("pleaseSelectCurrencyFirst") : undefined}
            onClick={onSave}
          >
            {t("save")}
          </button>
          <button type="button" className="account-btn account-btn-cancel currency-setting-cancel-btn" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

