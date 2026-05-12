import { useMemo, useState, useRef, useEffect } from "react";
import ReportDatePicker from "../common/ReportDatePicker.jsx";
import { quickRangeToDates } from "../../../utils/dateUtils.js";

const QUICK_RANGE_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

export default function DomainReportFilters({
  companyId,
  onSwitchCompany,
  companies,
  selectedGroup,
  onGroupClick,
  processId,
  setProcessId,
  processes,
  currencyList,
  selectedCurrencies,
  toggleCurrency,
  showAllCurrencies,
  toggleAllCurrencies,
  dateFrom,
  dateTo,
  onRangeChange,
  t,
}) {
  const [processSearch, setProcessSearch] = useState("");
  const [processDropdownOpen, setProcessDropdownOpen] = useState(false);

  const processDropdownRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (processDropdownRef.current && !processDropdownRef.current.contains(e.target)) setProcessDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filteredProcesses = useMemo(() => {
    const all = [{ id: "", display_text: t("allProcess") }, ...processes];
    if (!processSearch.trim()) return all;
    const s = processSearch.toLowerCase();
    const allLabel = t("allProcess").toLowerCase();
    return all.filter((p) => {
      const text = (p.display_text || "").toLowerCase();
      return text.includes(s) || (p.id === "" && allLabel.includes(s));
    });
  }, [processes, processSearch, t]);

  const selectedProcessLabel = useMemo(() => {
    if (!processId) return t("allProcess");
    const found = processes.find(p => String(p.id) === String(processId));
    return found ? found.display_text : t("allProcess");
  }, [processes, processId, t]);

  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  return (
    <div className="domain-report-filter-container">
      <div className="domain-report-filters">
        {/* Process Select */}
        <div className="domain-report-filter-group">
          <label className="maintenance-label">{t("process")}</label>
          <div className="custom-select-wrapper" ref={processDropdownRef}>
            <button
              type="button"
              className={`custom-select-button ${processDropdownOpen ? "open" : ""}`}
              onClick={() => setProcessDropdownOpen(!processDropdownOpen)}
            >
              {selectedProcessLabel}
            </button>
            {processDropdownOpen && (
              <div className="custom-select-dropdown show">
                <div className="custom-select-search">
                  <input
                    type="text"
                    placeholder={t("searchProcess")}
                    autoComplete="off"
                    value={processSearch}
                    onChange={(e) => setProcessSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="custom-select-options">
                  {filteredProcesses.map(p => (
                    <div
                      key={p.id || "all"}
                      className={`custom-select-option ${String(p.id) === String(processId) ? "selected" : ""}`}
                      onClick={() => { setProcessId(p.id); setProcessDropdownOpen(false); }}
                    >
                      {p.display_text}
                    </div>
                  ))}
                  {filteredProcesses.length === 0 && (
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
          containerClass="domain-report-filter-group"
          label={t("dateRange")}
          placeholder={t("selectDateRange")}
          selectEndDateHint={t("selectEndDate")}
        />

        {/* Quick Select */}
        <div className="domain-report-filter-group quick-select-wrap">
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
      </div>

      <div className="customer-report-buttons-section" style={{ marginTop: 15 }}>
        {/* Group ID Buttons */}
        {snapGroupIds.length > 0 && (
          <div className="transaction-company-filter shared-group-wrapper" style={{ marginBottom: 10 }}>
            <span className="transaction-company-label" style={{ minWidth: 80, display: "inline-block" }}>{t("groupId")}</span>
            <div className="transaction-company-buttons" style={{ display: "inline-flex", gap: 10 }}>
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

        {/* Company Buttons */}
        {snapCompanies.length > 0 && (
          <div className="transaction-company-filter shared-company-wrapper">
            <span className="transaction-company-label" style={{ minWidth: 80, display: "inline-block" }}>{t("company")}</span>
            <div className="transaction-company-buttons" style={{ display: "inline-flex", gap: 10 }}>
              {snapCompanies.map((comp) => {
                const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
                const visible = selectedGroup ? cGid === selectedGroup : true;

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
            <span className="transaction-company-label" style={{ minWidth: 80, display: "inline-block" }}>{t("currency")}</span>
            <div className="transaction-company-buttons" style={{ display: "inline-flex", gap: 10 }}>
              <button
                type="button"
                className={`transaction-company-btn ${showAllCurrencies ? "active" : ""}`}
                onClick={toggleAllCurrencies}
              >
                {t("all")}
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
    </div>
  );
}
