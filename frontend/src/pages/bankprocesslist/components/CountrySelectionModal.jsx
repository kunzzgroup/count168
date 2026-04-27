import React from "react";

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
}) {
  return (
    <div id="countrySelectionModal" className="modal" style={{ display: "block" }}>
      <div className="modal-content country-selection-modal">
        <div className="modal-header">
          <h2>Select or Add Country</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <div className="country-selection-container">
            <div className="available-countries-section">
              <div className="add-country-bar">
                <h3>Add New Country</h3>
                <form className="add-country-form" onSubmit={onSubmitNewCountry}>
                  <div className="add-country-input-group">
                    <input type="text" id="new_country_name" placeholder="Enter new country name..." value={newCountryName} onChange={(e) => setNewCountryName(e.target.value.toUpperCase())} />
                    <button type="submit" className="btn btn-save">Add</button>
                  </div>
                </form>
              </div>
              <h3>Available Countries</h3>
              <div className="country-search">
                <input type="text" id="countrySearch" placeholder="Search countries..." value={countrySearch} onChange={(e) => setCountrySearch(e.target.value.toUpperCase())} />
              </div>
              <div className="country-list" id="existingCountries">
                {[...new Set([...(countriesList || []), ...selectedCountryChips])]
                  .filter((c) => !countrySearch.trim() || c.toUpperCase().includes(countrySearch.trim()))
                  .map((c) => (
                  <div
                    key={c}
                    className="country-item"
                    role="presentation"
                    onClick={() => setSelectedCountryChips((prev) => (prev.includes(c) ? prev : [...prev, c]))}
                  >
                    <div className="country-item-left">
                      <span>{c}</span>
                    </div>
                    <button
                      type="button"
                      className="remove-country-modal"
                      aria-label={`Remove ${c}`}
                      title={`Remove ${c}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void onRemoveAvailableCountry(c);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="selected-countries-section">
              <h3>Selected Countries</h3>
              <div className="selected-countries-list" id="selectedCountriesInModal">
                {selectedCountryChips.length === 0 ? (
                  <div className="no-countries">None</div>
                ) : (
                  selectedCountryChips.map((c) => (
                    <div key={`sel-${c}`} className="selected-country-modal-item">
                      <span>{c}</span>
                      <button type="button" className="remove-country-modal" aria-label={`Remove ${c}`} onClick={() => setSelectedCountryChips((prev) => prev.filter((x) => x !== c))}>
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-save"
              id="confirmCountriesBtn"
              onClick={() => {
                if (selectedCountryChips.length !== 1) {
                  notify("Select exactly one country on the right (add from the list or remove extras with ×).", "warning");
                  return;
                }
                onConfirm(selectedCountryChips[0]);
              }}
            >
              Confirm
            </button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
