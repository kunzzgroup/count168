export default function PaymentMaintenanceFilters({
  transactionType,
  setTransactionType,
  dateFrom,
  dateTo,
  today,
  companyId,
  companies,
  selectedGroup,
  onGroupClick,
  onSwitchCompany,
  currencies,
  selectedCurrency,
  setSelectedCurrency,
  onDelete,
  confirmDelete,
  setConfirmDelete,
  deleteDisabled,
  m,
}) {
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  return (
    <div className="maintenance-search-section">
      <div className="maintenance-filters">
        <div className="maintenance-form-group maintenance-outlined-field">
          <div className="maintenance-outlined-field__wrap">
            <span id="payment-maint-type-legend" className="maintenance-outlined-field__label">
              {m.transactionType}
            </span>
            <select
              id="filter_transaction_type"
              className="maintenance-select"
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              aria-labelledby="payment-maint-type-legend"
            >
              <option value="">{m.allTypes}</option>
              <option value="CONTRA">CONTRA</option>
              <option value="PAYMENT">PAYMENT</option>
              <option value="RECEIVE">RECEIVE</option>
              <option value="CLAIM">CLAIM</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="RATE">RATE</option>
            </select>
          </div>
        </div>

        <div className="maintenance-form-group maintenance-date-inline maintenance-outlined-field">
          <div className="maintenance-outlined-field__wrap">
            <span id="payment-maint-date-legend" className="maintenance-outlined-field__label">
              {m.dateRange}
            </span>
            <div
              className="date-range-picker"
              id="date-range-picker"
              aria-labelledby="payment-maint-date-legend"
            >
              <i className="fas fa-calendar-alt" aria-hidden={true} />
              <span id="date-range-display">{m.selectDateRange}</span>
            </div>
            <input type="hidden" id="date_from" defaultValue={dateFrom || today} />
            <input type="hidden" id="date_to" defaultValue={dateTo || today} />
          </div>
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
          {(snapGroupIds.length > 0 || snapCompanies.length > 0 || currencies.length > 0) && (
            <div className="user-gc-inline-panel maintenance-gc-panel">
              {snapGroupIds.length > 0 && (
                <div className="user-gc-inline-row">
                  <span className="user-gc-inline-label">{m.groupId}</span>
                  <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll" id="group-buttons-wrapper">
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
                  <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll" id="company-buttons-wrapper">
                    <div className="user-gc-segment-group" role="group" aria-label={m.company}>
                      {snapCompanies
                        .filter(
                          (c) =>
                            (c.group_id ? String(c.group_id).toUpperCase().trim() : "") === (selectedGroup || "")
                        )
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`user-gc-segment${Number(companyId) === Number(c.id) ? " is-on" : ""}`}
                            onClick={() => onSwitchCompany(c)}
                          >
                            {String(c.company_id || "").toUpperCase()}
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
                      {currencies.map((curr) => (
                        <button
                          key={curr.code}
                          type="button"
                          className={`user-gc-segment${selectedCurrency === curr.code ? " is-on" : ""}`}
                          onClick={() => setSelectedCurrency(curr.code)}
                        >
                          {curr.code}
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
            disabled={deleteDisabled}
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
