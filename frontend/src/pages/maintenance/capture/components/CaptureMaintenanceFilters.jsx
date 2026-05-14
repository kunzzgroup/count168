import { useMemo } from "react";
import ProcessSelect from "./ProcessSelect.jsx";

export default function CaptureMaintenanceFilters({
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
  onDelete,
  canDelete,
  confirmDelete,
  setConfirmDelete,
  m,
}) {
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  const visibleCompanies = useMemo(() => {
    return snapCompanies.filter((comp) => {
      const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
      if (selectedGroup) return cGid === selectedGroup;
      return !cGid;
    });
  }, [snapCompanies, selectedGroup]);

  return (
    <div className="maintenance-search-section">
      <div className="maintenance-filters">
        <div className="maintenance-form-group maintenance-outlined-field">
          <div className="maintenance-outlined-field__wrap">
            <span
              id="capture-maintenance-process-legend"
              className="maintenance-outlined-field__label"
            >
              {m.process}
            </span>
            <ProcessSelect
              processes={processes}
              selectedValue={selectedProcess}
              onSelect={setSelectedProcess}
              placeholder={m.selectAllProcesses}
              searchPlaceholder={m.searchProcessPlaceholder}
              noResultsText={m.noResultsFound}
              ariaLabelledBy="capture-maintenance-process-legend"
            />
          </div>
        </div>

        <div className="maintenance-form-group maintenance-date-inline maintenance-outlined-field">
          <div className="maintenance-outlined-field__wrap">
            <span
              id="capture-maintenance-date-range-legend"
              className="maintenance-outlined-field__label"
            >
              {m.dateRange}
            </span>
            <div
              className="date-range-picker"
              id="date-range-picker"
              aria-labelledby="capture-maintenance-date-range-legend"
            >
              <i className="fas fa-calendar-alt" aria-hidden={true} />
              <span id="date-range-display">{m.selectDateRange}</span>
            </div>
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
              onClick={(e) => {
                e.stopPropagation();
                window.toggleQuickSelectDropdown?.();
              }}
            >
              <i className="fas fa-calendar-alt" />
              <span id="quick-select-text">{m.period}</span>
              <i className="fas fa-chevron-down" />
            </button>
            <div className="dropdown-menu" id="quick-select-dropdown">
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("today")}>
                {m.today}
              </button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("yesterday")}>
                {m.yesterday}
              </button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisWeek")}>
                {m.thisWeek}
              </button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastWeek")}>
                {m.lastWeek}
              </button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisMonth")}>
                {m.thisMonth}
              </button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastMonth")}>
                {m.lastMonth}
              </button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisYear")}>
                {m.thisYear}
              </button>
              <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastYear")}>
                {m.lastYear}
              </button>
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
                  <div
                    className="user-gc-inline-pills user-gc-inline-pills--segment-scroll"
                    id="group-buttons-wrapper"
                  >
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
                  <div
                    className="user-gc-inline-pills user-gc-inline-pills--segment-scroll"
                    id="company-buttons-wrapper"
                  >
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
            disabled={!canDelete || !confirmDelete}
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
