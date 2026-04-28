import { useState, useEffect, useRef } from "react";
import ProcessSelect from "./ProcessSelect.jsx";

export default function FormulaMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  dateFrom,
  dateTo,
  today,
  searchFilter,
  setSearchFilter,
  companyId,
  companies,
  selectedGroup,
  onGroupClick,
  onSwitchCompany,
  onClearFilters,
  showClear
}) {
  const [quickSelectOpen, setQuickSelectOpen] = useState(false);
  const quickSelectRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (quickSelectRef.current && !quickSelectRef.current.contains(e.target)) setQuickSelectOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  return (
    <div className="maintenance-search-section">
      <div className="maintenance-filters">
        <div className="maintenance-form-group">
          <label className="maintenance-label">Process</label>
          <ProcessSelect 
            processes={processes}
            selectedValue={selectedProcess}
            onSelect={setSelectedProcess}
          />
        </div>

        <div className="maintenance-form-group maintenance-date-inline">
          <label className="maintenance-label">Date Range</label>
          <div className="date-range-picker" id="date-range-picker">
            <i className="fas fa-calendar-alt" />
            <span id="date-range-display">Select date range</span>
          </div>
          <input type="hidden" id="date_from" defaultValue={dateFrom || today} />
          <input type="hidden" id="date_to" defaultValue={dateTo || today} />
        </div>

        <div className="maintenance-form-group quick-select-wrap" ref={quickSelectRef}>
          <label className="maintenance-label"><i className="fas fa-clock" /> Quick Select</label>
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
            <div className="dropdown-menu" id="quick-select-dropdown" style={{ display: quickSelectOpen ? "block" : undefined }}>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("today"); setQuickSelectOpen(false); }}>Today</button>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("yesterday"); setQuickSelectOpen(false); }}>Yesterday</button>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("thisWeek"); setQuickSelectOpen(false); }}>This Week</button>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("lastWeek"); setQuickSelectOpen(false); }}>Last Week</button>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("thisMonth"); setQuickSelectOpen(false); }}>This Month</button>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("lastMonth"); setQuickSelectOpen(false); }}>Last Month</button>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("thisYear"); setQuickSelectOpen(false); }}>This Year</button>
              <button type="button" className="dropdown-item" onClick={() => { window.selectQuickRange?.("lastYear"); setQuickSelectOpen(false); }}>Last Year</button>
            </div>
          </div>
        </div>

        <div className="maintenance-form-group search-filter-wrap">
          <label className="maintenance-label">Search Formula/Account</label>
          <div className="search-input-container" style={{ position: "relative" }}>
            <i className="fas fa-search search-icon" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
            <input 
              type="text" 
              id="search_filter" 
              className="maintenance-input" 
              placeholder="Filter by formula, account, or source..." 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ paddingLeft: "30px", width: "100%" }}
            />
          </div>
        </div>

        <div className="maintenance-form-group clear-filters-wrap">
          <label className="maintenance-label" style={{ opacity: 0 }}>Clear</label>
          <button 
            type="button" 
            id="clear_filters_btn" 
            className="maintenance-btn maintenance-btn-outline"
            onClick={onClearFilters}
            style={{ 
              opacity: showClear ? 1 : 0, 
              pointerEvents: showClear ? "auto" : "none",
              transition: "opacity 0.3s ease",
              width: "100%",
              height: "clamp(32px, 2.22vw, 40px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <i className="fas fa-times" /> Clear Filters
          </button>
        </div>
      </div>

      <div className="maintenance-filter-row">
        <div className="maintenance-filter-left">
          {snapGroupIds.length > 0 && (
            <div className="transaction-company-filter shared-group-wrapper">
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
            <div className="transaction-company-filter shared-company-wrapper">
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
        </div>
      </div>
    </div>
  );
}
