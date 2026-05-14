import { useMemo, useState, useRef, useEffect } from "react";
import ReportDatePicker from "../common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "./ReportGcFilterPanel.jsx";

const QUICK_RANGE_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

export default function DomainReportFilters({
  companyId,
  onSwitchCompany,
  groupIds,
  groupFilterKind,
  selectedGroupKey,
  onPickAllGroups,
  onPickGroup,
  companyButtons,
  switchingCompany,
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
  quickRangeToDates,
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

      <ReportGcFilterPanel
        groupIds={groupIds}
        groupFilterKind={groupFilterKind}
        selectedGroupKey={selectedGroupKey}
        onPickAllGroups={onPickAllGroups}
        onPickGroup={onPickGroup}
        companyButtons={companyButtons}
        companyId={companyId}
        onSwitchCompany={onSwitchCompany}
        switchingCompany={switchingCompany}
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
