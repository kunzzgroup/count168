import { useMemo } from "react";
import { isCompanyVisibleForSharedFilter } from "../../../utils/sharedCompanyFilter.js";

/** GroupID = ALL: show C168 first (same expectation as other owner tools). */
function orderSnapCompaniesForAllGroup(companies) {
  const list = Array.isArray(companies) ? companies : [];
  if (list.length === 0) return list;
  const code = (c) => String(c.company_id || "").trim().toUpperCase();
  const i = list.findIndex((c) => code(c) === "C168");
  if (i <= 0) return [...list];
  const next = [...list];
  const [c168] = next.splice(i, 1);
  return [c168, ...next];
}

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
  searchState,
  setSearchState,
  fs,
  onGroupButtonClick,
  onGroupFilterAllClick,
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

  const companiesForCompanyStrip = useMemo(() => {
    const list = fs.snapCompanies || [];
    if (fs.groupFilterKind === "all") return orderSnapCompaniesForAllGroup(list);
    return list;
  }, [fs.snapCompanies, fs.groupFilterKind]);

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
        {(fs.snapGroupIds.length > 0 || fs.snapCompanies.length > 0 || currencyRowsOrdered.length > 0) && (
          <div className="user-gc-inline-panel">
            {fs.snapGroupIds.length > 0 && (
              <div id="group-buttons-wrapper" className="user-gc-inline-row">
                <span className="user-gc-inline-label">GroupID:</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div id="group-buttons-container" className="user-gc-segment-group" role="group" aria-label="Group ID">
                    <button
                      type="button"
                      className={`user-gc-segment${fs.groupFilterKind === "all" ? " is-on" : ""}`}
                      data-group-filter="all"
                      onClick={() => onGroupFilterAllClick?.()}
                    >
                      ALL
                    </button>
                    {fs.snapGroupIds.map((gid) => (
                      <button
                        key={gid}
                        type="button"
                        className={`user-gc-segment${fs.groupFilterKind === "follow" && fs.selectedGroup === gid ? " is-on" : ""}`}
                        data-group-id={gid}
                        onClick={() => onGroupButtonClick(gid)}
                      >
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {fs.snapCompanies.length > 0 && (
              <div id="company-buttons-wrapper" className="user-gc-inline-row">
                <span className="user-gc-inline-label">Company:</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div id="company-buttons-container" className="user-gc-segment-group" role="group" aria-label="Company">
                    {companiesForCompanyStrip.map((comp) => {
                      const visible = isCompanyVisibleForSharedFilter(
                        comp,
                        fs.selectedGroup,
                        hideGroupFilter,
                        fs.groupFilterKind || "follow",
                      );
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          style={{ display: visible ? undefined : "none" }}
                          className={`user-gc-segment${Number(comp.id) === Number(fs.companyId) ? " is-on" : ""}`}
                          data-company-id={comp.id}
                          data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                          data-company-code={comp.company_id}
                          onClick={() => {
                            if (!visible) return;
                            onCompanyButtonClick(comp);
                          }}
                        >
                          {String(comp.company_id || "").toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {currencyRowsOrdered.length > 0 && (
              <div id="currency-buttons-wrapper" className="user-gc-inline-row">
                <span className="user-gc-inline-label">Currency:</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div id="currency-buttons-container" className="user-gc-segment-group" role="group" aria-label="Currency">
                    <button
                      type="button"
                      className={`user-gc-segment${showAllCurrencies ? " is-on" : ""}`}
                      data-currency-code="ALL"
                      onClick={toggleAllCurrenciesBtn}
                    >
                      All
                    </button>
                    {currencyRowsOrdered.map((c) => {
                      const code = c.code;
                      return (
                        <button
                          key={code}
                          type="button"
                          className={`user-gc-segment${!showAllCurrencies && selectedCurrencies.includes(code) ? " is-on" : ""}`}
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
