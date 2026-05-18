import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDescriptionCatalog, postAddDescription, postDeleteDescription } from "./dataCaptureApi.js";
import { pushDataCaptureNotification } from "./dataCaptureNotify.js";

function normalizeCatalog(json) {
  const raw = json?.descriptions ?? json?.data?.descriptions ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => ({
      id: d.id,
      name: d.name != null ? String(d.name) : "",
    }))
    .filter((d) => d.name && d.id != null);
}

export default function DescriptionSelectionModal({ open, onClose, companyId, onConfirm }) {
  const [catalog, setCatalog] = useState([]);
  const [pendingNames, setPendingNames] = useState([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");

  const loadCatalog = useCallback(async () => {
    if (!companyId) {
      setCatalog([]);
      return;
    }
    try {
      const result = await fetchDescriptionCatalog(companyId);
      if (!result.success) {
        pushDataCaptureNotification(result.error || "Failed to load descriptions", "danger");
        setCatalog([]);
        return;
      }
      setCatalog(normalizeCatalog(result));
    } catch {
      pushDataCaptureNotification("Failed to load descriptions", "danger");
      setCatalog([]);
    }
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    setPendingNames(Array.isArray(window.selectedDescriptions) ? [...window.selectedDescriptions] : []);
    setSearch("");
    setNewName("");
    void loadCatalog();
  }, [open, loadCatalog]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((d) => d.name.toLowerCase().includes(q));
  }, [catalog, search]);

  const toggleName = useCallback((name, checked) => {
    setPendingNames((prev) => {
      if (checked) {
        if (prev.includes(name)) return prev;
        return [...prev, name];
      }
      return prev.filter((n) => n !== name);
    });
  }, []);

  const removeSelected = useCallback((name) => {
    setPendingNames((prev) => prev.filter((n) => n !== name));
  }, []);

  const handleAdd = useCallback(
    async (e) => {
      e.preventDefault();
      const trimmed = newName.trim();
      if (!trimmed || !companyId) return;
      try {
        const result = await postAddDescription(companyId, trimmed);
        const dup =
          result.duplicate === true ||
          result.data?.duplicate === true ||
          String(result.error || "").includes("already exists");
        if (!result.success) {
          if (dup) {
            pushDataCaptureNotification("Description name already exists", "danger");
          } else {
            pushDataCaptureNotification(result.error || "Failed to add description", "danger");
          }
          return;
        }
        const newId = result.data?.description_id ?? result.description_id;
        if (newId != null) {
          setCatalog((prev) => {
            if (prev.some((p) => String(p.id) === String(newId))) return prev;
            return [...prev, { id: newId, name: trimmed }];
          });
        } else {
          void loadCatalog();
        }
        setPendingNames((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
        setNewName("");
        pushDataCaptureNotification("Description added successfully!", "success");
      } catch {
        pushDataCaptureNotification("Failed to add description", "danger");
      }
    },
    [companyId, newName, loadCatalog]
  );

  const handleDelete = useCallback(
    async (id, name) => {
      if (!id) return;
      if (!window.confirm(`Are you sure you want to delete description ${name}? This action cannot be undone.`)) {
        return;
      }
      try {
        const result = await postDeleteDescription(id);
        if (!result.success) {
          pushDataCaptureNotification(result.error || "Failed to delete description", "danger");
          return;
        }
        setCatalog((prev) => prev.filter((d) => String(d.id) !== String(id)));
        setPendingNames((prev) => {
          const next = prev.filter((n) => n !== name);
          window.selectedDescriptions = [...next];
          if (typeof window.__DC_ON_DESCRIPTIONS_CONFIRMED__ === "function") {
            window.__DC_ON_DESCRIPTIONS_CONFIRMED__(next);
          }
          setTimeout(() => {
            if (typeof window.updateSubmitButtonState === "function") window.updateSubmitButtonState();
          }, 0);
          return next;
        });
        pushDataCaptureNotification("Description deleted successfully", "success");
      } catch {
        pushDataCaptureNotification("Failed to delete description", "danger");
      }
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (pendingNames.length === 0) {
      pushDataCaptureNotification("Please select at least one description", "danger");
      return;
    }
    onConfirm(pendingNames);
  }, [onConfirm, pendingNames]);

  return (
    <div
      id="descriptionSelectionModal"
      className={`modal${open ? " show" : ""}`.trim()}
      style={{ display: open ? "block" : "none" }}
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      aria-labelledby="dc-desc-modal-title"
    >
      <div className="modal-content description-selection-modal">
        <div className="modal-header">
          <h2 id="dc-desc-modal-title">Select or Add Description</h2>
          <span className="close" onClick={onClose} role="presentation">
            &times;
          </span>
        </div>
        <div className="modal-body">
          <div className="description-selection-container">
            <div className="selected-descriptions-section">
              <h3>Selected Descriptions</h3>
              <div className="selected-descriptions-list" id="selectedDescriptionsInModal">
                {pendingNames.length === 0 ? (
                  <div className="no-descriptions">No descriptions selected</div>
                ) : (
                  pendingNames.map((name) => (
                    <div key={name} className="selected-description-modal-item">
                      <span>{name}</span>
                      <button type="button" className="remove-description-modal" onClick={() => removeSelected(name)}>
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="available-descriptions-section">
              <div className="add-description-bar">
                <h3>Add New Description</h3>
                <form className="add-description-form" onSubmit={handleAdd}>
                  <div className="add-description-input-group">
                    <input
                      type="text"
                      name="description_name"
                      placeholder="Enter new description name..."
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value.toUpperCase())}
                    />
                    <button type="submit" className="btn btn-save">
                      Add
                    </button>
                  </div>
                </form>
              </div>

              <h3>Available Descriptions</h3>
              <div className="description-search">
                <input
                  type="text"
                  placeholder="Search descriptions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value.toUpperCase())}
                />
              </div>
              <div className="description-list" id="existingDescriptions">
                {filteredCatalog.length === 0 ? (
                  <div className="no-descriptions">No descriptions found</div>
                ) : (
                  filteredCatalog.map((d) => (
                    <div key={String(d.id)} className="description-item">
                      <div className="description-item-left">
                        <input
                          type="checkbox"
                          name="available_descriptions"
                          value={d.name}
                          id={`desc_${d.id}`}
                          data-description-id={d.id}
                          checked={pendingNames.includes(d.name)}
                          onChange={(e) => toggleName(d.name, e.target.checked)}
                        />
                        <label htmlFor={`desc_${d.id}`}>{d.name}</label>
                      </div>
                      <button
                        type="button"
                        className="description-delete-btn"
                        title="Delete description"
                        aria-label="Delete description"
                        onClick={() => void handleDelete(d.id, d.name)}
                      >
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-save" id="confirmDescriptionsBtn" onClick={handleConfirm}>
              Confirm
            </button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
