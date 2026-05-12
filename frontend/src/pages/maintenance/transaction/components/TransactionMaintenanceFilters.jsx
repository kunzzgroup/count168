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
  onSwitchCompany,
  m,
}) {
  const normalize = (value) => String(value || "").toUpperCase().trim();
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => normalize(c.group_id)))].sort();
  const dedupedCompanies = (() => {
    const byCode = new Map();
    for (const comp of snapCompanies) {
      const key = normalize(comp.company_id);
      const existing = byCode.get(key);
      if (!existing) {
        byCode.set(key, comp);
        continue;
      }
      // Keep currently selected company row if duplicates share the same company code.
      const existingIsCurrent = Number(existing.id) === Number(companyId);
      const currentIsCurrent = Number(comp.id) === Number(companyId);
      if (!existingIsCurrent && currentIsCurrent) byCode.set(key, comp);
    }
    return Array.from(byCode.values());
  })();

  return (
    <div className="maintenance-search-section">
      <div className="maintenance-filters">
        <div className="maintenance-form-group">
          <label className="maintenance-label">{m.process}</label>
          <ProcessSelect
            processes={processes}
            selectedValue={selectedProcess}
            onSelect={setSelectedProcess}
            placeholder={m.selectAllProcesses}
            searchPlaceholder={m.searchProcessPlaceholder}
            noResultsText={m.noResultsFound}
          />
        </div>

        <div className="maintenance-form-group maintenance-date-inline">
          <label className="maintenance-label">{m.dateRange}</label>
          <div className="date-range-picker" id="date-range-picker">
            <i className="fas fa-calendar-alt" />
            <span id="date-range-display">{m.selectDateRange}</span>
          </div>
          <input type="hidden" id="date_from" defaultValue={dateFrom || today} />
          <input type="hidden" id="date_to" defaultValue={dateTo || today} />
        </div>

        <div className="maintenance-form-group quick-select-wrap">
          <label className="maintenance-label">
            <i className="fas fa-clock" /> {m.quickSelect}
          </label>
          <div className="quick-select-dropdown quick-select-dropdown-toggle">
            <button 
              type="button" 
              className="dropdown-toggle" 
              onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}
            >
              <i className="fas fa-calendar-alt" />
              <span id="quick-select-text">{m.period}</span>
              <i className="fas fa-chevron-down" />
            </button>
            <div className="dropdown-menu" id="quick-select-dropdown">
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("today")}>{m.today}</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("yesterday")}>{m.yesterday}</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisWeek")}>{m.thisWeek}</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastWeek")}>{m.lastWeek}</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisMonth")}>{m.thisMonth}</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastMonth")}>{m.lastMonth}</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisYear")}>{m.thisYear}</button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastYear")}>{m.lastYear}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="maintenance-filter-row">
        <div className="maintenance-filter-left">
          {snapGroupIds.length > 0 && (
            <div className="maintenance-company-filter shared-group-wrapper">
              <span className="maintenance-company-label">{m.groupId}</span>
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
            <div className="maintenance-company-filter shared-company-wrapper">
              <span className="maintenance-company-label">{m.company}</span>
              <div className="maintenance-company-buttons">
                {dedupedCompanies.map((comp) => {
                  const cGid = comp.group_id != null ? normalize(comp.group_id) : "";
                  const isC168 = normalize(comp.company_id) === "C168";
                  let visible = true;
                  if (selectedGroup) visible = cGid === selectedGroup || isC168;
                  else visible = !cGid || isC168;

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
