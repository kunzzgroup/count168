import { useMemo, useState, useRef, useEffect } from "react";
import CustomerReportDatePicker from "./CustomerReportDatePicker.jsx";

export default function CustomerReportFilters({ 
  companyId, 
  onSwitchCompany, 
  companies, 
  selectedGroup, 
  onGroupClick,
  accountId,
  setAccountId,
  accounts,
  dateFrom,
  dateTo,
  onRangeChange,
  quickRangeToDates,
  showAll,
  setShowAll,
  currencyList,
  selectedCurrencies,
  toggleCurrency,
  showAllCurrencies,
  toggleAllCurrencies
}) {
  const [accountSearch, setAccountSearch] = useState("");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [quickSelectOpen, setQuickSelectOpen] = useState(false);
  
  const accountDropdownRef = useRef(null);
  const quickSelectRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) setAccountDropdownOpen(false);
      if (quickSelectRef.current && !quickSelectRef.current.contains(e.target)) setQuickSelectOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const s = accountSearch.toLowerCase();
    return accounts.filter(a => 
      (a.account_id || "").toLowerCase().includes(s) || 
      (a.name || "").toLowerCase().includes(s) ||
      (a.display_text || "").toLowerCase().includes(s)
    );
  }, [accounts, accountSearch]);

  const selectedAccountLabel = useMemo(() => {
    if (!accountId) return "All Accounts";
    const found = accounts.find(a => String(a.id) === String(accountId));
    return found ? (found.display_text || `${found.account_id} - ${found.name}`) : "All Accounts";
  }, [accounts, accountId]);

  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        {/* Account Select */}
        <div className="customer-report-filter-group">
          <label>Account</label>
          <div className="custom-select-wrapper" ref={accountDropdownRef}>
            <button 
              type="button" 
              className={`custom-select-button ${accountDropdownOpen ? "open" : ""}`}
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
            >
              {selectedAccountLabel}
            </button>
            {accountDropdownOpen && (
              <div className="custom-select-dropdown show">
                <div className="custom-select-search">
                  <input 
                    type="text" 
                    placeholder="Search account..." 
                    autoComplete="off" 
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="custom-select-options">
                  <div 
                    className={`custom-select-option ${!accountId ? "selected" : ""}`}
                    onClick={() => { setAccountId(""); setAccountDropdownOpen(false); }}
                  >
                    All Accounts
                  </div>
                  {filteredAccounts.map(a => (
                    <div 
                      key={a.id} 
                      className={`custom-select-option ${String(a.id) === String(accountId) ? "selected" : ""}`}
                      onClick={() => { setAccountId(a.id); setAccountDropdownOpen(false); }}
                    >
                      {a.display_text || `${a.account_id} - ${a.name}`}
                    </div>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <div className="custom-select-no-results">No results found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Date Range Picker */}
        <CustomerReportDatePicker 
          dateFrom={dateFrom} 
          dateTo={dateTo} 
          onRangeChange={onRangeChange} 
        />

        {/* Quick Select & Show All */}
        <div className="customer-report-quick-and-showall">
          <div className="customer-report-filter-group quick-select-wrap" ref={quickSelectRef}>
            <label className="form-label">
              <i className="fas fa-clock" /> Quick Select
            </label>
            <div className="quick-select-dropdown quick-select-dropdown-toggle">
              <button
                type="button"
                className="dropdown-toggle"
                onClick={(e) => { e.stopPropagation(); setQuickSelectOpen(!quickSelectOpen); }}
              >
                <i className="fas fa-calendar-alt" />
                <span id="quick-select-text">Period</span>
                <i className="fas fa-chevron-down" />
              </button>
              {quickSelectOpen && (
                <div className="dropdown-menu" style={{ display: "block" }}>
                  {["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"].map(r => (
                    <button key={r} type="button" className="dropdown-item" onClick={() => {
                      const dates = quickRangeToDates(r);
                      if (dates) onRangeChange(dates.startDate, dates.endDate);
                      setQuickSelectOpen(false);
                    }}>
                      {r.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase())}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="customer-report-filter-group customer-report-showall-group">
            <div className="customer-report-checkbox-section">
              <label className="transaction-checkbox-label">
                <input 
                  type="checkbox" 
                  className="transaction-checkbox" 
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                />
                Show All
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Group & Company Buttons */}
      {snapGroupIds.length > 0 && (
        <div className="transaction-company-filter shared-group-wrapper" style={{ marginTop: 15 }}>
          <span className="transaction-company-label">GroupID:</span>
          <div className="transaction-company-buttons">
            {snapGroupIds.map((gid) => (
              <button 
                key={gid} 
                type="button" 
                className={`transaction-company-btn shared-group-btn ${selectedGroup === gid ? "active" : ""}`}
                onClick={() => onGroupClick(gid)}
              >
                {gid}
              </button>
            ))}
          </div>
        </div>
      )}

      {snapCompanies.length > 0 && (
        <div className="transaction-company-filter shared-company-wrapper" style={{ marginTop: 10 }}>
          <span className="transaction-company-label">Company:</span>
          <div className="transaction-company-buttons">
            {snapCompanies.map((comp) => {
              const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
              let visible = true;
              if (selectedGroup) visible = cGid === selectedGroup;
              else visible = !cGid;
              
              return (
                <button
                  key={comp.id}
                  type="button"
                  style={{ display: visible ? "inline-block" : "none" }}
                  className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(companyId) ? "active" : ""}`}
                  onClick={() => onSwitchCompany(comp)}
                >
                  {comp.company_id}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Currency Buttons */}
      {currencyList.length > 0 && (
        <div className="transaction-company-filter" style={{ marginTop: 10 }}>
          <span className="transaction-company-label">Currency:</span>
          <div className="transaction-company-buttons">
            <button 
              type="button" 
              className={`transaction-company-btn ${showAllCurrencies ? "active" : ""}`}
              onClick={toggleAllCurrencies}
            >
              All
            </button>
            {currencyList.map(c => (
              <button 
                key={c.code} 
                type="button" 
                className={`transaction-company-btn ${selectedCurrencies.includes(c.code) ? "active" : ""}`}
                onClick={() => toggleCurrency(c.code)}
              >
                {c.code}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
