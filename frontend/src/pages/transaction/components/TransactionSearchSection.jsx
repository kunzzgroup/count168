import { isCompanyVisibleForSharedFilter } from "../../../utils/sharedCompanyFilter.js";

export default function TransactionSearchSection({
  selectedCategories,
  categoryOpen,
  toggleCategory,
  removeCategoryTag,
  categoryAllCheckboxRef,
  categories,
  onCategoryAllChange,
  toggleCategoryValue,
  effectiveDateRangeText,
  quickOpen,
  toggleQuick,
  selectQuickRange,
  searchState,
  setSearchState,
  fs,
  onGroupButtonClick,
  onCompanyButtonClick,
  currencyRowsOrdered,
  showAllCurrencies,
  selectedCurrencies,
  toggleAllCurrenciesBtn,
  onCurrencyDragStart,
  onCurrencyDropOn,
  toggleCurrencyBtn,
}) {
  const hideGroupFilter = !fs.snapGroupIds?.length;

  return (
    <div className="transaction-search-section">
      <div className="transaction-form-group">
        <label className="transaction-label">Category</label>
        <div id="filter_category" className="transaction-category-multiselect">
          <div className="category-dropdown">
            <button type="button" className="category-dropdown-button" id="category_dropdown_button" onClick={toggleCategory}>
              <div id="category_selected_tags" className="category-selected-tags">
                {selectedCategories.length === 0 ? (
                  <span className="category-placeholder">--Select All--</span>
                ) : (
                  selectedCategories.map((c) => (
                    <div key={c} className="category-tag" data-category-value={c}>
                      <span>{c}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="category-tag-remove"
                        data-category-value={c}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeCategoryTag(c);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            removeCategoryTag(c);
                          }
                        }}
                      >
                        ×
                      </span>
                    </div>
                  ))
                )}
              </div>
              <i className="fas fa-chevron-down" />
            </button>
            <div className="category-dropdown-menu" id="category_dropdown_menu" style={{ display: categoryOpen ? "block" : "none" }}>
              <div className="category-option">
                <label className="category-checkbox-label">
                  <input
                    ref={categoryAllCheckboxRef}
                    type="checkbox"
                    value=""
                    className="category-checkbox"
                    id="category_all"
                    checked={
                      selectedCategories.length === 0 ||
                      (categories.length > 0 && selectedCategories.length === categories.length)
                    }
                    onChange={(e) => onCategoryAllChange(e.target.checked)}
                  />
                  <span>--Select All--</span>
                </label>
              </div>
              <div id="category_options_container">
                {categories.map((c) => (
                  <div className="category-option" key={c}>
                    <label className="category-checkbox-label">
                      <input
                        type="checkbox"
                        className="category-checkbox"
                        value={c}
                        checked={selectedCategories.length === 0 ? false : selectedCategories.includes(c)}
                        onChange={() => toggleCategoryValue(c)}
                      />
                      <span>{c}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="transaction-date-quick-row">
        <label className="transaction-label transaction-capture-date-label">Capture Date</label>
        <div className="transaction-date-range-group">
          <div className="date-range-picker" id="date-range-picker">
            <i className="fas fa-calendar-alt" />
            <span id="date-range-display">{effectiveDateRangeText}</span>
          </div>
          <input type="hidden" id="date_from" readOnly />
          <input type="hidden" id="date_to" readOnly />
        </div>
        <div className="quick-select-dropdown quick-select-dropdown-toggle">
          <button
            type="button"
            className="dropdown-toggle"
            onClick={(e) => {
              e.stopPropagation();
              toggleQuick();
            }}
          >
            <i className="fas fa-calendar-alt" />
            <span id="quick-select-text">Period</span>
            <i className="fas fa-chevron-down" />
          </button>
          <div className={`dropdown-menu${quickOpen ? " show" : ""}`} id="quick-select-dropdown">
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("today")}>Today</button>
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("yesterday")}>Yesterday</button>
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("thisWeek")}>This Week</button>
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("lastWeek")}>Last Week</button>
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("thisMonth")}>This Month</button>
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("lastMonth")}>Last Month</button>
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("thisYear")}>This Year</button>
            <button type="button" className="dropdown-item" onClick={() => selectQuickRange("lastYear")}>Last Year</button>
          </div>
        </div>
      </div>

      <div className="transaction-checkboxes">
        <label className="transaction-checkbox-label">
          <input type="checkbox" id="show_name" className="transaction-checkbox" checked={searchState.showName} onChange={(e) => setSearchState((s) => ({ ...s, showName: e.target.checked }))} />
          Show Name
        </label>
        <label className="transaction-checkbox-label">
          <input type="checkbox" id="show_capture_only" className="transaction-checkbox" checked={searchState.showCaptureOnly} onChange={(e) => setSearchState((s) => ({ ...s, showCaptureOnly: e.target.checked }))} />
          Show Win/Loss Only
        </label>
        <label className="transaction-checkbox-label">
          <input type="checkbox" id="show_inactive" className="transaction-checkbox" checked={searchState.showPaymentOnly} onChange={(e) => setSearchState((s) => ({ ...s, showPaymentOnly: e.target.checked }))} />
          Show Payment Only
        </label>
        <label className="transaction-checkbox-label">
          <input type="checkbox" id="show_zero_balance" className="transaction-checkbox" checked={searchState.showZeroBalance} onChange={(e) => setSearchState((s) => ({ ...s, showZeroBalance: e.target.checked }))} />
          Show 0 balance
        </label>
      </div>

      <div className="transaction-bottom-filters">
        {fs.snapGroupIds.length > 0 && (
          <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper">
            <span className="transaction-company-label">GroupID:</span>
            <div id="group-buttons-container" className="transaction-company-buttons">
              {fs.snapGroupIds.map((gid) => (
                <button key={gid} type="button" className={`transaction-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`} data-group-id={gid} onClick={() => onGroupButtonClick(gid)}>
                  {gid}
                </button>
              ))}
            </div>
          </div>
        )}

        {fs.snapCompanies.length > 0 && (
          <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper">
            <span className="transaction-company-label">Company:</span>
            <div id="company-buttons-container" className="transaction-company-buttons">
              {fs.snapCompanies.map((comp) => {
                const visible = isCompanyVisibleForSharedFilter(comp, fs.selectedGroup, hideGroupFilter);
                return (
                  <button
                    key={comp.id}
                    type="button"
                    style={{ display: visible ? undefined : "none" }}
                    className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`}
                    data-company-id={comp.id}
                    data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                    data-company-code={comp.company_id}
                    onClick={() => {
                      if (!visible) return;
                      onCompanyButtonClick(comp);
                    }}
                  >
                    {comp.company_id}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div id="currency-buttons-wrapper" className="transaction-company-filter" style={{ display: currencyRowsOrdered.length > 0 ? "flex" : "none" }}>
          <span className="transaction-company-label">Currency:</span>
          <div id="currency-buttons-container" className="transaction-company-buttons">
            <button type="button" className={`transaction-company-btn${showAllCurrencies ? " active" : ""}`} data-currency-code="ALL" onClick={toggleAllCurrenciesBtn}>
              All
            </button>
            {currencyRowsOrdered.map((c) => {
              const code = c.code;
              return (
                <button
                  key={code}
                  type="button"
                  className={`transaction-company-btn${!showAllCurrencies && selectedCurrencies.includes(code) ? " active" : ""}`}
                  data-currency-code={code}
                  draggable
                  onDragStart={() => onCurrencyDragStart(code)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onCurrencyDropOn(code)}
                  onClick={() => toggleCurrencyBtn(code)}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
