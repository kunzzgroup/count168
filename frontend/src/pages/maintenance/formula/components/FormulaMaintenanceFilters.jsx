import { useState, useEffect } from "react";
import ProcessSelect from "./ProcessSelect.jsx";

export default function FormulaMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
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
