export default function BankprocessMaintenanceFilters({
  permissions,
  selectedPermission,
  setSelectedPermission,
  dateFrom,
  dateTo,
  today,
  query,
  setQuery,
  onSearch,
  groupedIds,
  selectedGroup,
  onGroupClick,
  companies,
  visibleCompanies,
  companyId,
  handleSwitchCompany,
  currencies,
  selectedCurrency,
  setSelectedCurrency,
  confirmDelete,
  setConfirmDelete,
  selectedIds,
  onDelete,
}) {
  return (
    <>
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{`Maintenance - ${selectedPermission || "Process"}`}</h1>
        {permissions.length > 1 && (
          <div id="bankprocess-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">Category:</span>
            <div id="bankprocess-permission-buttons" className="maintenance-company-buttons">
              {permissions.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`maintenance-company-btn ${selectedPermission === p ? "active" : ""}`}
                  onClick={() => setSelectedPermission(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="maintenance-search-section">
        <div className="maintenance-filters">
          <div className="maintenance-form-group maintenance-date-inline">
            <label className="maintenance-label">Date Range</label>
            <div className="date-range-picker" id="date-range-picker">
              <i className="fas fa-calendar-alt" />
              <span id="date-range-display">Select date range</span>
            </div>
            <input type="hidden" id="date_from" defaultValue={dateFrom || today} />
            <input type="hidden" id="date_to" defaultValue={dateTo || today} />
          </div>

          <div className="maintenance-form-group maintenance-search-inline" id="from-search-row">
            <label className="maintenance-label" htmlFor="filter_from_search">Search</label>
            <div className="search-container maintenance-search-container">
              <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                id="filter_from_search"
                placeholder="e.g. TEST M16(CIMB) / CIMB"
                className="search-input maintenance-search-input"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSearch();
                  }
                }}
              />
            </div>
          </div>

          <div className="maintenance-form-group quick-select-wrap">
            <label className="form-label"><i className="fas fa-clock" /> Quick Select</label>
            <div className="quick-select-dropdown quick-select-dropdown-toggle">
              <button type="button" className="dropdown-toggle" onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}>
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
            {groupedIds.length > 0 && (
              <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper">
                <span className="transaction-company-label">GroupID:</span>
                <div id="group-buttons-container" className="transaction-company-buttons">
                  {groupedIds.map((gid) => (
                    <button
                      key={gid}
                      type="button"
                      className={`transaction-company-btn shared-group-btn ${selectedGroup === gid ? "active" : ""}`}
                      data-group-id={gid}
                      onClick={() => onGroupClick(gid)}
                    >
                      {gid}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {companies.length > 0 && (
              <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper">
                <span className="transaction-company-label">Company:</span>
                <div id="company-buttons-container" className="transaction-company-buttons">
                  {visibleCompanies.map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(companyId) ? "active" : ""}`}
                      data-company-id={comp.id}
                      data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                      data-company-code={comp.company_id}
                      onClick={() => handleSwitchCompany(comp)}
                    >
                      {comp.company_id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div id="currency-buttons-wrapper" className="maintenance-company-filter" style={{ display: currencies.length > 0 ? "flex" : "none" }}>
              <span className="maintenance-company-label">Currency:</span>
              <div className="maintenance-company-buttons" id="currency-buttons-container">
                {currencies.map((currency) => (
                  <button
                    key={currency.code}
                    type="button"
                    className={`maintenance-company-btn ${selectedCurrency === currency.code ? "active" : ""}`}
                    onClick={() => setSelectedCurrency(currency.code)}
                  >
                    {currency.code}
                  </button>
                ))}
              </div>
            </div>
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
    </>
  );
}
