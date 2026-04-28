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
  selectedIds,
  confirmDelete,
  setConfirmDelete,
  onDelete,
}) {
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
  const showClear = Boolean(searchFilter || selectedProcess);

  return (
    <div className="maintenance-search-section formula-maintenance-filters-wrap">
      <div className="maintenance-filters">
        <div className="maintenance-form-group">
          <label className="maintenance-label">Process</label>
          <div className="custom-select-wrapper formula-process-control">
            <ProcessSelect processes={processes} selectedValue={selectedProcess} onSelect={setSelectedProcess} />
            <button
              type="button"
              id="clear_filters_btn"
              title="Clear Filters"
              className="formula-clear-icon-btn"
              onClick={onClearFilters}
              style={{ opacity: showClear ? 1 : 0, pointerEvents: showClear ? "auto" : "none" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="maintenance-form-group">
          <label className="maintenance-label">Search</label>
          <div className="search-input-container formula-search-input-container">
            <i className="fas fa-search search-icon" />
            <input 
              type="text" 
              id="search_filter" 
              className="maintenance-input" 
              placeholder="Search formula..." 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ paddingLeft: "30px", width: "100%" }}
            />
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

        <div className="maintenance-actions">
          <button
            type="button"
            className="maintenance-delete-btn"
            id="deleteBtn"
            onClick={onDelete}
            disabled={selectedIds.length === 0 || !confirmDelete}
          >
            Delete
          </button>
          <label className="maintenance-confirm-delete-label">
            <input
              type="checkbox"
              id="confirmDelete"
              className="maintenance-checkbox"
              checked={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.checked)}
            />
            <span>Confirm Delete</span>
          </label>
        </div>
      </div>
    </div>
  );
}
