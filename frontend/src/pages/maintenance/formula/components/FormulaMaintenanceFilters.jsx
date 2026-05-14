import { useMemo } from "react";
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
  m,
}) {
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
  const showClear = Boolean(searchFilter || selectedProcess);

  const visibleCompanies = useMemo(() => {
    return snapCompanies.filter((comp) => {
      const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
      if (selectedGroup) return cGid === selectedGroup;
      return true;
    });
  }, [snapCompanies, selectedGroup]);

  return (
    <div className="maintenance-search-section formula-maintenance-filters-wrap">
      <div className="maintenance-filters">
        <div className="maintenance-form-group maintenance-outlined-field">
          <div className="maintenance-outlined-field__wrap">
            <span id="formula-maint-process-legend" className="maintenance-outlined-field__label">
              {m.process}
            </span>
            <div className="custom-select-wrapper formula-process-control">
              <ProcessSelect
                processes={processes}
                selectedValue={selectedProcess}
                onSelect={setSelectedProcess}
                placeholder={m.selectAllProcesses}
                searchPlaceholder={m.searchProcessPlaceholder}
                noResultsText={m.noResultsFound}
                ariaLabelledBy="formula-maint-process-legend"
              />
              <button
                type="button"
                id="clear_filters_btn"
                title={m.clearFiltersTitle}
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
        </div>

        <div className="maintenance-form-group maintenance-outlined-field">
          <div className="maintenance-outlined-field__wrap">
            <span id="formula-maint-search-legend" className="maintenance-outlined-field__label">
              {m.search}
            </span>
            <div className="search-input-container formula-search-input-container">
              <i className="fas fa-search search-icon" aria-hidden={true} />
              <input
                type="text"
                id="search_filter"
                className="maintenance-input"
                placeholder={m.searchFormulaPlaceholder}
                value={searchFilter}
                aria-labelledby="formula-maint-search-legend"
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{ paddingLeft: "30px", width: "100%" }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="maintenance-filter-row">
        <div className="maintenance-filter-left">
          {(snapGroupIds.length > 0 || snapCompanies.length > 0) && (
            <div className="user-gc-inline-panel maintenance-gc-panel">
              {snapGroupIds.length > 0 && (
                <div className="user-gc-inline-row">
                  <span className="user-gc-inline-label">{m.groupId}</span>
                  <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                    <div className="user-gc-segment-group" role="group" aria-label={m.groupId}>
                      {snapGroupIds.map((gid) => (
                        <button
                          key={gid}
                          type="button"
                          className={`user-gc-segment${selectedGroup === gid ? " is-on" : ""}`}
                          onClick={() => onGroupClick(gid)}
                        >
                          {gid}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {snapCompanies.length > 0 && (
                <div className="user-gc-inline-row">
                  <span className="user-gc-inline-label">{m.company}</span>
                  <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                    <div className="user-gc-segment-group" role="group" aria-label={m.company}>
                      {visibleCompanies.map((comp) => (
                        <button
                          key={comp.id}
                          type="button"
                          className={`user-gc-segment${Number(comp.id) === Number(companyId) ? " is-on" : ""}`}
                          onClick={() => onSwitchCompany(comp)}
                        >
                          {String(comp.company_id || "").toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
            {m.delete}
          </button>
          <div className="userlist-filter-chips maintenance-confirm-filter-chips" role="group" aria-label={m.confirmDelete}>
            <button
              type="button"
              id="confirmDelete"
              className={`user-filter-chip${confirmDelete ? " is-selected" : ""}`}
              aria-pressed={confirmDelete}
              onClick={() => setConfirmDelete(!confirmDelete)}
            >
              <span className="user-filter-chip__dot" aria-hidden={true}>
                {confirmDelete ? (
                  <svg
                    className="user-filter-chip__check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 12l4 4 8-8" />
                  </svg>
                ) : null}
              </span>
              <span className="user-filter-chip__label">{m.confirmDelete}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
