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
  allCurrenciesSelected,
  selectedCurrencies,
  onCurrencyToggle,
  onCurrencySelectAll,
  confirmDelete,
  setConfirmDelete,
  selectedIds,
  onDelete,
  pageTitle,
  m,
}) {
  return (
    <>
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{pageTitle}</h1>
        {permissions.length > 1 && (
          <div id="bankprocess-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">{m.category}</span>
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
          <div className="maintenance-form-group maintenance-date-inline maintenance-outlined-field">
            <div className="maintenance-outlined-field__wrap">
              <span id="bankprocess-maint-date-legend" className="maintenance-outlined-field__label">
                {m.dateRange}
              </span>
              <div
                className="date-range-picker"
                id="date-range-picker"
                aria-labelledby="bankprocess-maint-date-legend"
              >
                <i className="fas fa-calendar-alt" aria-hidden={true} />
                <span id="date-range-display">{m.selectDateRange}</span>
              </div>
              <input type="hidden" id="date_from" defaultValue={dateFrom || today} />
              <input type="hidden" id="date_to" defaultValue={dateTo || today} />
            </div>
          </div>

          <div className="maintenance-form-group maintenance-search-inline maintenance-outlined-field" id="from-search-row">
            <div className="maintenance-outlined-field__wrap">
              <span id="bankprocess-maint-search-legend" className="maintenance-outlined-field__label">
                {m.search}
              </span>
              <div className="search-container maintenance-search-container">
                <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="text"
                  id="filter_from_search"
                  placeholder={m.bankSearchPlaceholder}
                  className="search-input maintenance-search-input"
                  autoComplete="off"
                  value={query}
                  aria-labelledby="bankprocess-maint-search-legend"
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
          </div>

          <div className="maintenance-form-group quick-select-wrap">
            <label className="maintenance-label">
              <i className="fas fa-clock" /> {m.quickSelect}
            </label>
            <div className="quick-select-dropdown quick-select-dropdown-toggle">
              <button type="button" className="dropdown-toggle" onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}>
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
            {(groupedIds.length > 0 || companies.length > 0 || currencies.length > 0) && (
              <div className="user-gc-inline-panel maintenance-gc-panel">
                {groupedIds.length > 0 && (
                  <div className="user-gc-inline-row">
                    <span className="user-gc-inline-label">{m.groupId}</span>
                    <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll" id="group-buttons-wrapper">
                      <div className="user-gc-segment-group" role="group" aria-label={m.groupId}>
                        {groupedIds.map((gid) => (
                          <button
                            key={gid}
                            type="button"
                            className={`user-gc-segment${selectedGroup === gid ? " is-on" : ""}`}
                            data-group-id={gid}
                            onClick={() => onGroupClick(gid)}
                          >
                            {gid}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {companies.length > 0 && (
                  <div className="user-gc-inline-row">
                    <span className="user-gc-inline-label">{m.company}</span>
                    <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll" id="company-buttons-wrapper">
                      <div className="user-gc-segment-group" role="group" aria-label={m.company}>
                        {visibleCompanies.map((comp) => (
                          <button
                            key={comp.id}
                            type="button"
                            className={`user-gc-segment${Number(comp.id) === Number(companyId) ? " is-on" : ""}`}
                            data-company-id={comp.id}
                            data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                            data-company-code={comp.company_id}
                            onClick={() => handleSwitchCompany(comp)}
                          >
                            {String(comp.company_id || "").toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {currencies.length > 0 && (
                  <div className="user-gc-inline-row">
                    <span className="user-gc-inline-label">{m.currency}</span>
                    <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll" id="currency-buttons-wrapper">
                      <div className="user-gc-segment-group" role="group" aria-label={m.currency}>
                        <button
                          key="__all_currencies__"
                          type="button"
                          className={`user-gc-segment${allCurrenciesSelected ? " is-on" : ""}`}
                          onClick={onCurrencySelectAll}
                        >
                          {m.currencyAll}
                        </button>
                        {currencies.map((currency) => {
                          const on = !allCurrenciesSelected && selectedCurrencies.includes(currency.code);
                          return (
                            <button
                              key={currency.code}
                              type="button"
                              className={`user-gc-segment${on ? " is-on" : ""}`}
                              onClick={() => onCurrencyToggle(currency.code)}
                            >
                              {currency.code}
                            </button>
                          );
                        })}
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
    </>
  );
}
