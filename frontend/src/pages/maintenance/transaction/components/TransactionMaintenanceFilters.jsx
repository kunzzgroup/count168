import { useMemo } from "react";
import ProcessSelect from "./ProcessSelect.jsx";

export default function TransactionMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  dateFrom,
  dateTo,
  today,
  companyId,
  companies,
  selectedGroup,
  onGroupClick,
  onSwitchCompany
}) {
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

        <div className="maintenance-form-group quick-select-wrap">
          <label className="maintenance-label"><i className="fas fa-clock" /> Quick Select</label>
          <div className="quick-select-dropdown quick-select-dropdown-toggle">
            <button 
              type="button" 
              className="dropdown-toggle" 
              onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}
            >
              <i className="fas fa-calendar-alt" />
              <span id="quick-select-text">Period</span>
              <i className="fas fa-chevron-down" />
            </button>
            <div className="dropdown-menu" id="quick-select-dropdown">
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("today")}>Today</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("yesterday")}>Yesterday</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisWeek")}>This Week</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastWeek")}>Last Week</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisMonth")}>This Month</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastMonth")}>Last Month</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisYear")}>This Year</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastYear")}>Last Year</button>
            </div>
          </div>
        </div>
      </div>

      <div className="maintenance-filter-row">
        <div className="maintenance-filter-left">
          {snapGroupIds.length > 0 && (
            <div className="transaction-company-filter shared-group-wrapper">
              <span className="maintenance-company-label">GroupID:</span>
              <div className="maintenance-company-buttons">
                {snapGroupIds.map((gid) => (
                  <button 
                    key={gid} 
                    type="button" 
                    className={`maintenance-company-btn shared-group-btn ${selectedGroup === gid ? "active" : ""}`}
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
              <span className="maintenance-company-label">Company:</span>
              <div className="maintenance-company-buttons">
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
                      className={`maintenance-company-btn shared-company-btn ${Number(comp.id) === Number(companyId) ? "active" : ""}`}
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
