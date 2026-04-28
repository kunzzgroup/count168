import { useMemo, useState, useRef, useEffect } from "react";
import ProcessSelect from "./ProcessSelect.jsx";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import { quickRangeToDates } from "../../../../utils/dateUtils.js";

export default function TransactionMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  dateFrom,
  dateTo,
  onRangeChange,
  companyId,
  companies,
  selectedGroup,
  onGroupClick,
  onSwitchCompany
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

        <ReportDatePicker 
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={onRangeChange}
          label="Date Range"
          containerClass="maintenance-form-group"
        />

        <div className="maintenance-form-group quick-select-wrap" ref={quickSelectRef}>
          <label className="form-label"><i className="fas fa-clock" /> Quick Select</label>
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
