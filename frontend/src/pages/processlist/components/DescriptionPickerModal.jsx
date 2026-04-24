import React, { useState, useMemo } from "react";

export default function DescriptionPickerModal({
  descriptions,
  form,
  onConfirm,
  onClose,
  onAddDescription,
  onDeleteDescription,
}) {
  const [search, setSearch] = useState("");
  const [newDescName, setNewDescName] = useState("");
  // localSelected holds the array of selected description objects: { id, name }
  const [localSelected, setLocalSelected] = useState([...(form.selected_descriptions || [])]);

  const filteredDescriptions = useMemo(() => {
    if (!search.trim()) return descriptions;
    const lowerSearch = search.toLowerCase();
    return descriptions.filter((d) => String(d.name || "").toLowerCase().includes(lowerSearch));
  }, [descriptions, search]);

  const toggleSelect = (desc) => {
    setLocalSelected((prev) => {
      const exists = prev.find((item) => String(item.id) === String(desc.id));
      if (exists) return prev.filter((item) => String(item.id) !== String(desc.id));
      return [...prev, desc];
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newDescName.trim()) return;
    await onAddDescription(newDescName.trim());
    setNewDescName("");
  };

  return (
    <div className="modal" style={{ display: "block", zIndex: 10050 }} role="dialog" aria-modal="true">
      <div className="modal-content description-selection-modal">
        <div className="modal-header">
          <h2>Select or Add Description</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body">
          <div className="description-selection-container">
            {/* Left side - Selected descriptions */}
            <div className="selected-descriptions-section">
              <h3>Selected Descriptions</h3>
              <div className="selected-descriptions-list">
                {localSelected.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#999", fontStyle: "italic" }}>
                    No descriptions selected
                  </div>
                ) : (
                  localSelected.map((item) => (
                    <div key={item.id} className="selected-description-item">
                      {item.name}
                      <span className="remove-selected" onClick={() => toggleSelect(item)}>&times;</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right side - Add new and available descriptions */}
            <div className="available-descriptions-section">
              <div className="add-description-bar">
                <h3>Add New Description</h3>
                <form className="add-description-form" onSubmit={handleAdd}>
                  <div className="add-description-input-group">
                    <input
                      type="text"
                      placeholder="ENTER NEW DESCRIPTION NAME..."
                      value={newDescName}
                      onChange={(e) => setNewDescName(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn btn-save">Add</button>
                  </div>
                </form>
              </div>

              <h3>Available Descriptions</h3>
              <div className="description-search">
                <input
                  type="text"
                  placeholder="Search descriptions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="description-list">
                {filteredDescriptions.map((d) => {
                  const isSelected = localSelected.some((item) => String(item.id) === String(d.id));
                  return (
                    <div key={d.id} className="description-list-item">
                      <label className="description-checkbox-label">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(d)}
                        />
                        <span style={{ marginLeft: "8px" }}>{d.name}</span>
                      </label>
                      <button
                        type="button"
                        className="delete-description-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDescription(d.id);
                        }}
                        title="Delete Description"
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-save" onClick={() => onConfirm(localSelected)}>Confirm Selection</button>
          </div>
        </div>
      </div>
    </div>
  );
}
