import { useMemo, useState, useRef, useEffect } from "react";
import ReportDatePicker from "../common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "./ReportGcFilterPanel.jsx";

const QUICK_RANGE_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

export default function CustomerReportFilters({
  companyId,
  onSwitchCompany,
  groupIds,
  groupFilterKind,
  selectedGroupKey,
  onPickAllGroups,
  onPickGroup,
  companyButtons,
  highlightCompanyId,
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
  toggleAllCurrencies,
  t,
}) {
  const [accountSearch, setAccountSearch] = useState("");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const accountDropdownRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) setAccountDropdownOpen(false);
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
    if (!accountId) return t("allAccounts");
    const found = accounts.find(a => String(a.id) === String(accountId));
    return found ? (found.display_text || `${found.account_id} - ${found.name}`) : t("allAccounts");
  }, [accounts, accountId, t]);

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        {/* Account Select */}
        <div className="customer-report-filter-group">
          <label className="maintenance-label">{t("account")}</label>
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
                    placeholder={t("searchAccount")}
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
                    {t("allAccounts")}
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
                    <div className="custom-select-no-results">{t("noResultsFound")}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Date Range Picker */}
        <ReportDatePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={onRangeChange}
          containerClass="customer-report-filter-group"
          label={t("dateRange")}
          placeholder={t("selectDateRange")}
          selectEndDateHint={t("selectEndDate")}
        />

        {/* Quick Select & Show All */}
        <div className="customer-report-quick-and-showall">
          <div className="customer-report-filter-group quick-select-wrap">
            <label className="form-label">
              <i className="fas fa-clock" /> {t("quickSelect")}
            </label>
            <div className="quick-select-dropdown quick-select-dropdown-toggle">
              <button
                type="button"
                className="dropdown-toggle"
                onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}
              >
                <i className="fas fa-calendar-alt" />
                <span id="quick-select-text">{t("period")}</span>
                <i className="fas fa-chevron-down" />
              </button>
              <div className="dropdown-menu" id="quick-select-dropdown">
                {QUICK_RANGE_KEYS.map((key) => (
                  <button key={key} type="button" className="dropdown-item" onClick={() => {
                    if (window.selectQuickRange) {
                      window.selectQuickRange(key);
                      return;
                    }
                    const dates = quickRangeToDates(key);
                    if (dates) onRangeChange(dates.startDate, dates.endDate);
                  }}>
                    {t(key)}
                  </button>
                ))}
              </div>
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
                {t("showAll")}
              </label>
            </div>
          </div>
        </div>
      </div>

      <ReportGcFilterPanel
        groupIds={groupIds}
        groupFilterKind={groupFilterKind}
        selectedGroupKey={selectedGroupKey}
        onPickAllGroups={onPickAllGroups}
        onPickGroup={onPickGroup}
        companyButtons={companyButtons}
        companyId={companyId}
        highlightCompanyId={highlightCompanyId}
        onSwitchCompany={onSwitchCompany}
        currencyList={currencyList}
        showAllCurrencies={showAllCurrencies}
        selectedCurrencies={selectedCurrencies}
        toggleAllCurrencies={toggleAllCurrencies}
        toggleCurrency={toggleCurrency}
        t={t}
      />
    </div>
  );
}
