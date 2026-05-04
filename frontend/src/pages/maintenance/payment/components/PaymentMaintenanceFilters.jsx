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
  deleteDisabled
}) {
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  return (
    <div className="maintenance-search-section">
      <div className="maintenance-filters">
        <div className="maintenance-form-group">
          <label className="maintenance-label">Transaction Type</label>
          <select 
            id="filter_transaction_type" 
            className="maintenance-select"
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value)}
          >
            <option value="">--All Types--</option>
            <option value="CONTRA">CONTRA</option>
            <option value="PAYMENT">PAYMENT</option>
            <option value="RECEIVE">RECEIVE</option>
            <option value="CLAIM">CLAIM</option>
            <option value="ADJUSTMENT">ADJUSTMENT</option>
            <option value="RATE">RATE</option>
          </select>
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
            <div id="group-buttons-wrapper" className="maintenance-company-filter shared-group-wrapper">
              <span className="maintenance-company-label">GroupID:</span>
              <div id="group-buttons-container" className="maintenance-company-buttons">
                {snapGroupIds.map(gid => (
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

          <div id="company-buttons-wrapper" className="maintenance-company-filter shared-company-wrapper">
            <span className="maintenance-company-label">Company:</span>
            <div id="company-buttons-container" className="maintenance-company-buttons">
              {snapCompanies.filter(c => (c.group_id ? String(c.group_id).toUpperCase().trim() : "") === (selectedGroup || "")).map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`maintenance-company-btn shared-company-btn ${Number(companyId) === Number(c.id) ? "active" : ""}`}
                  onClick={() => onSwitchCompany(c)}
                >
                  {c.company_id}
                </button>
              ))}
            </div>
          </div>

          {currencies.length > 0 && (
            <div id="currency-buttons-wrapper" className="maintenance-company-filter">
              <span className="maintenance-company-label">Currency:</span>
              <div className="maintenance-company-buttons">
                {currencies.map(curr => (
                  <button
                    key={curr.code}
                    type="button"
                    className={`maintenance-company-btn ${selectedCurrency === curr.code ? "active" : ""}`}
                    onClick={() => setSelectedCurrency(curr.code)}
                  >
                    {curr.code}
                  </button>
                ))}
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
            disabled={deleteDisabled}
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
