import React from "react";

function TrashRemoveIcon() {
  return (
    <svg className="country-list-delete-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3h6l1 2h5v2H3V5h5l1-2z" fill="currentColor" opacity="0.9" />
      <path d="M5 9h14l-1 12H6L5 9z" fill="currentColor" />
    </svg>
  );
}

export default function CountrySelectionModal({
  countriesList,
  selectedCountryChips,
  setSelectedCountryChips,
  countrySearch,
  setCountrySearch,
  newCountryName,
  setNewCountryName,
  onSubmitNewCountry,
  onRemoveAvailableCountry,
  onConfirm,
  onClose,
  notify,
  t,
}) {
  const selectedCode = selectedCountryChips[0] ?? null;

  return (
    <div id="countrySelectionModal" className="modal country-selection-modal-wrap" style={{ display: "block" }}>
      <div className="modal-content country-selection-modal">
        <div className="modal-header country-selection-modal-header">
          <h2>{t("selectOrAddCountry")}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body country-selection-modal-body">
          <div className="country-selection-container">
            <div className="available-countries-section">
              <div className="add-country-bar">
                <h3>{t("addNewCountry")}</h3>
                <form className="add-country-form" onSubmit={onSubmitNewCountry}>
                  <div className="add-country-input-group">
                    <input
                      type="text"
                      id="new_country_name"
                      placeholder={t("newCountryNamePlaceholder")}
                      value={newCountryName}
                      onChange={(e) => setNewCountryName(e.target.value.toUpperCase())}
                    />
                    <button type="submit" className="btn btn-save country-selection-add-btn">{t("add")}</button>
                  </div>
                </form>
              </div>
              <h3>{t("availableCountries")}</h3>
              <div className="country-search">
                <input
                  type="text"
                  id="countrySearch"
                  placeholder={t("searchCountriesShort")}
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value.toUpperCase())}
                />
              </div>
              <div className="country-list" id="existingCountries">
                {[...new Set([...(countriesList || []), ...selectedCountryChips])]
                  .filter((c) => !countrySearch.trim() || c.toUpperCase().includes(countrySearch.trim()))
                  .map((c) => (
                    <div
                      key={c}
                      className={`country-item${selectedCode === c ? " is-picked" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedCountryChips(selectedCode === c ? [] : [c])}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedCountryChips(selectedCode === c ? [] : [c]);
                        }
                      }}
                    >
                      <div className="country-item-left">
                        <span className="country-item-code">{c}</span>
                      </div>
                      <button
                        type="button"
                        className="country-list-delete"
                        aria-label={t("removeCountryFromCompanyListAria", { country: c })}
                        title={t("removeCountryFromCompanyListAria", { country: c })}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void onRemoveAvailableCountry(c);
                        }}
                      >
                        <TrashRemoveIcon />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
            <div className="selected-countries-section">
              <h3>{t("selectedCountries")}</h3>
              <div className="selected-countries-list" id="selectedCountriesInModal">
                {selectedCountryChips.length === 0 ? (
                  <div className="no-countries">{t("none")}</div>
                ) : (
                  selectedCountryChips.map((c) => (
                    <div key={`sel-${c}`} className="selected-country-modal-item">
                      <span>{c}</span>
                      <button
                        type="button"
                        className="remove-country-modal"
                        aria-label={t("removeSelectedCountryAria", { country: c })}
                        onClick={() => setSelectedCountryChips((prev) => prev.filter((x) => x !== c))}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer country-selection-modal-footer">
          <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
          <button
            type="button"
            className="btn btn-save"
            id="confirmCountriesBtn"
            onClick={() => {
              if (selectedCountryChips.length !== 1) {
                notify(t("selectExactlyOneCountry"), "warning");
                return;
              }
              onConfirm(selectedCountryChips[0]);
            }}
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
