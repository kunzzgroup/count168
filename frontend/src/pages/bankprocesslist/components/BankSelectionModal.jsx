import React from "react";

export default function BankSelectionModal({
  banksList,
  selectedBankChips,
  setSelectedBankChips,
  bankSearch,
  setBankSearch,
  newBankName,
  setNewBankName,
  onSubmitNewBank,
  onRemoveAvailableBank,
  onConfirm,
  onClose,
  notify,
}) {
  const toggleBankChipSelection = (b) => {
    setSelectedBankChips((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  };

  return (
    <div id="bankSelectionModal" className="modal" style={{ display: "block" }}>
      <div className="modal-content bank-selection-modal">
        <div className="modal-header">
          <h2>Select or Add Bank</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <div className="bank-selection-container">
            <div className="available-banks-section">
              <div className="add-bank-bar">
                <h3>Add New Bank</h3>
                <form className="add-bank-form" onSubmit={onSubmitNewBank}>
                  <div className="add-bank-input-group">
                    <input type="text" id="new_bank_name" placeholder="Enter new bank name..." value={newBankName} onChange={(e) => setNewBankName(e.target.value.toUpperCase())} />
                    <button type="submit" className="btn btn-save">Add</button>
                  </div>
                </form>
              </div>
              <h3>Available Banks</h3>
              <div className="bank-search">
                <input type="text" id="bankSearch" placeholder="Search banks..." value={bankSearch} onChange={(e) => setBankSearch(e.target.value.toUpperCase())} />
              </div>
              <div className="bank-list" id="existingBanks">
                {banksList.filter((b) => !bankSearch.trim() || b.toUpperCase().includes(bankSearch.trim())).map((b) => (
                  <div
                    key={b}
                    className={`country-item${selectedBankChips.includes(b) ? " selected" : ""}`}
                    role="presentation"
                    onClick={() => toggleBankChipSelection(b)}
                  >
                    <div className="country-item-left">
                      <span>{b}</span>
                    </div>
                    <button
                      type="button"
                      className="remove-country-modal"
                      aria-label={`Remove ${b}`}
                      title={`Remove ${b}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void onRemoveAvailableBank(b);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="selected-banks-section">
              <h3>Selected Banks</h3>
              <div className="selected-banks-list" id="selectedBanksInModal">
                {selectedBankChips.length === 0 ? (
                  <div className="no-countries">None</div>
                ) : (
                  selectedBankChips.map((b) => (
                    <div key={`sel-b-${b}`} className="selected-country-modal-item">
                      <span>{b}</span>
                      <button type="button" className="remove-country-modal" aria-label={`Remove ${b}`} onClick={() => setSelectedBankChips((prev) => prev.filter((x) => x !== b))}>
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
              id="confirmBanksBtn"
              onClick={() => {
                if (selectedBankChips.length !== 1) {
                  notify("Select exactly one bank on the right (add from the list or remove extras with ×).", "warning");
                  return;
                }
                onConfirm(selectedBankChips[0]);
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
