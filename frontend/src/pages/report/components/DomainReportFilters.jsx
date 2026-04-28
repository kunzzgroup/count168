import { useMemo, useState, useRef, useEffect } from "react";
import ReportDatePicker from "../common/ReportDatePicker.jsx";
import { quickRangeToDates } from "../../../utils/dateUtils.js";

export default function DomainReportFilters({
  companyId,
  onSwitchCompany,
  companies,
  selectedGroup,
  onGroupClick,
  processId,
  setProcessId,
  processes,
  dateFrom,
  dateTo,
  onRangeChange,
}) {
  const [processSearch, setProcessSearch] = useState("");
  const [processDropdownOpen, setProcessDropdownOpen] = useState(false);
  const [quickSelectOpen, setQuickSelectOpen] = useState(false);

  const processDropdownRef = useRef(null);
  const quickSelectRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (processDropdownRef.current && !processDropdownRef.current.contains(e.target)) setProcessDropdownOpen(false);
      if (quickSelectRef.current && !quickSelectRef.current.contains(e.target)) setQuickSelectOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filteredProcesses = useMemo(() => {
    const all = [{ id: "", display_text: "All Process" }, ...processes];
    if (!processSearch.trim()) return all;
    const s = processSearch.toLowerCase();
    return all.filter(p => (p.display_text || "").toLowerCase().includes(s));
  }, [processes, processSearch]);

  const selectedProcessLabel = useMemo(() => {
    if (!processId) return "All Process";
    const found = processes.find(p => String(p.id) === String(processId));
    return found ? found.display_text : "All Process";
  }, [processes, processId]);

  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  return (
    <div className="domain-report-filter-container">
      <div className="domain-report-filters">
        {/* Process Select */}
        <div className="domain-report-filter-group">
          <label>Process</label>
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
                    placeholder="Search process..."
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
                    <div className="custom-select-no-results">No results found</div>
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
        />

        {/* Quick Select */}
        <div className="domain-report-filter-group quick-select-wrap" ref={quickSelectRef}>
          <label className="form-label">
            <i className="fas fa-clock" style={{ color: "#007AFF" }} /> Quick Select
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
      </div>

      <div className="customer-report-buttons-section" style={{ marginTop: 15 }}>
        {/* Group ID Buttons */}
        {snapGroupIds.length > 0 && (
          <div className="transaction-company-filter shared-group-wrapper" style={{ marginBottom: 10 }}>
            <span className="transaction-company-label" style={{ minWidth: 80, display: "inline-block" }}>GroupID:</span>
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
            <span className="transaction-company-label" style={{ minWidth: 80, display: "inline-block" }}>Company:</span>
            <div className="transaction-company-buttons" style={{ display: "inline-flex", gap: 10 }}>
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
      </div>
    </div>
  );
}
