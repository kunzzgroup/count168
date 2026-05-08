import React, { useMemo, useState, useRef, useEffect } from "react";

function sortedCopyFromOptions(existingProcesses) {
  if (!existingProcesses?.length) return [];
  return [...existingProcesses].sort((a, b) => {
    const aName = (a.process_name || "Unknown").toUpperCase();
    const bName = (b.process_name || "Unknown").toUpperCase();
    if (aName !== bName) return aName.localeCompare(bName);
    const aDesc = (a.description_name || "No Description").toUpperCase();
    const bDesc = (b.description_name || "No Description").toUpperCase();
    return aDesc.localeCompare(bDesc);
  });
}

/** Unique process_name rows for Multi-Process checkboxes (js/processlist.js). */
function uniqueProcessesForMultiUse(existingProcesses) {
  const seen = new Set();
  const out = [];
  for (const p of existingProcesses || []) {
    const name = p.process_name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(p);
  }
  return out;
}

export default function ProcessFormModal({
  editMode,
  form,
  setForm,
  currencies,
  days,
  onClose,
  onSubmit,
  onOpenDescriptionPicker,
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySearch, setCopySearch] = useState("");
  const copyWrapRef = useRef(null);

  const copyOptions = useMemo(() => sortedCopyFromOptions(form.existingProcesses), [form.existingProcesses]);
  const filteredCopy = useMemo(() => {
    const q = copySearch.trim().toLowerCase();
    if (!q) return copyOptions;
    return copyOptions.filter((p) => {
      const line = `${p.process_name || ""} ${p.description_name || ""}`.toLowerCase();
      return line.includes(q);
    });
  }, [copyOptions, copySearch]);

  const multiUseRows = useMemo(() => uniqueProcessesForMultiUse(form.existingProcesses), [form.existingProcesses]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!copyWrapRef.current?.contains(e.target)) setCopyOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const descSummary =
    form.selected_descriptions?.length > 0 ? `${form.selected_descriptions.length} description(s) selected` : "";

  const placeholderBtn = "Select Process to Copy From";
  const selectedCopyRow = copyOptions.find((p) => String(p.process_id) === String(form.copy_from));

  return (
    <div id={editMode ? "editModal" : "addModal"} className="modal" style={{ display: "block" }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{editMode ? "Edit Process" : "Add Process"}</h2>
          <span className="close" onClick={onClose} role="presentation">
            &times;
          </span>
        </div>
        <div className="modal-body">
          <form className="process-form add-grid" onSubmit={onSubmit}>
            <div className="add-col">
              {!editMode && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Copy From</label>
                    <div className="custom-select-wrapper" ref={copyWrapRef}>
                      <button
                        type="button"
                        className="custom-select-button"
                        onClick={() => setCopyOpen((o) => !o)}
                      >
                        {selectedCopyRow
                          ? `${selectedCopyRow.process_name || "Unknown"} - ${selectedCopyRow.description_name || "No Description"}`
                          : placeholderBtn}
                      </button>
                      {copyOpen && (
                        <div className="custom-select-dropdown" style={{ display: "block" }}>
                          <div className="custom-select-search">
                            <input
                              type="text"
                              placeholder="Search process..."
                              autoComplete="off"
                              value={copySearch}
                              onChange={(e) => setCopySearch(e.target.value)}
                            />
                          </div>
                          <div className="custom-select-options">
                            <div
                              className="custom-select-option"
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, copy_from: "" }));
                                setCopyOpen(false);
                                setCopySearch("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  setForm((prev) => ({ ...prev, copy_from: "" }));
                                  setCopyOpen(false);
                                  setCopySearch("");
                                }
                              }}
                            >
                              — Clear —
                            </div>
                            {filteredCopy.map((p) => (
                              <div
                                key={`${p.process_id}_${p.description_name || ""}`}
                                className="custom-select-option"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setForm((prev) => ({ ...prev, copy_from: String(p.process_id ?? "") }));
                                  setCopyOpen(false);
                                  setCopySearch("");
                                }}
                              >
                                {`${p.process_name || "Unknown"} - ${p.description_name || "No Description"}`}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Process ID *</label>
                  <div className={!editMode ? "input-with-checkbox" : ""}>
                    <input
                      value={form.process_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, process_name: e.target.value }))}
                      required={!form.is_multi_process}
                      readOnly={editMode || form.is_multi_process}
                      style={editMode || form.is_multi_process ? { backgroundColor: "#f5f5f5", cursor: "not-allowed" } : undefined}
                      placeholder="ENTER PROCESS ID"
                    />
                    {!editMode && (
                      <div className="checkbox-container">
                        <input
                          type="checkbox"
                          id="add_multi_use"
                          checked={form.is_multi_process || false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm((prev) => ({
                              ...prev,
                              is_multi_process: checked,
                              show_multi_process_selection: true,
                              selected_processes: checked ? prev.selected_processes : [],
                              process_name: checked ? "" : prev.process_name,
                            }));
                          }}
                        />
                        <label htmlFor="add_multi_use">Multi-Process</label>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!editMode && form.is_multi_process && form.show_multi_process_selection !== false && (
                <div className="form-row" id="multi_use_processes">
                  <div className="form-group">
                    <label>Select Multi-use Processes</label>
                    <div className="process-checkboxes" id="process_checkboxes">
                      {multiUseRows.map((p) => (
                        <div key={p.process_name} className="checkbox-item">
                          <input
                            type="checkbox"
                            id={`mp_${p.process_name.replace(/[^a-zA-Z0-9_]/g, "_")}`}
                            checked={(form.selected_processes || []).includes(p.process_name)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setForm((prev) => {
                                const nextList = checked
                                  ? [...(prev.selected_processes || []), p.process_name]
                                  : (prev.selected_processes || []).filter((name) => name !== p.process_name);
                                return { ...prev, selected_processes: nextList };
                              });
                            }}
                          />
                          <label htmlFor={`mp_${p.process_name.replace(/[^a-zA-Z0-9_]/g, "_")}`}>{p.process_name}</label>
                        </div>
                      ))}
                    </div>
                    <div className="multi-use-actions">
                      <button
                        type="button"
                        className="btn btn-save btn-small"
                        onClick={() => setForm((prev) => ({ ...prev, show_multi_process_selection: false }))}
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!editMode && form.is_multi_process && form.show_multi_process_selection === false && (
                <div className="form-row" id="selected_processes_display">
                  <div className="form-group">
                    <label>Selected Multi-use Processes</label>
                    <div className="selected-processes" id="selected_processes_list">
                      {form.selected_processes?.map((name) => (
                        <div key={name} className="selected-process-item">
                          <span>{name}</span>
                          <button
                            type="button"
                            className="remove-process"
                            onClick={() =>
                              setForm((prev) => {
                                const nextList = prev.selected_processes.filter((n) => n !== name);
                                return {
                                  ...prev,
                                  selected_processes: nextList,
                                  show_multi_process_selection: nextList.length === 0 ? true : false,
                                };
                              })
                            }
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Description *</label>
                  <div className="input-with-icon">
                    <input readOnly value={descSummary} placeholder="Click + to select descriptions" style={{ backgroundColor: "#f5f5f5" }} />
                    <button type="button" className="add-icon" aria-label="Choose description" onClick={onOpenDescriptionPicker}>
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ display: form.selected_descriptions?.length > 0 ? "block" : "none" }}>
                <div className="form-group">
                  <label>Selected Descriptions</label>
                  <div className="selected-descriptions" id="selected_descriptions_list">
                    {form.selected_descriptions?.map((desc) => (
                      <span key={desc.id} className="selected-description-tag">
                        {desc.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Currency</label>
                  <select
                    value={form.currency_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, currency_id: e.target.value }))}
                    required
                  >
                    <option value="">Select Currency</option>
                    {currencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editMode && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: "#666" }}>DTS Modified:</label>
                      <div
                        id="edit_dts_modified"
                        style={{
                          backgroundColor: "#f5f5f5",
                          marginTop: 5,
                          padding: "8px 12px",
                          border: "1px solid #ddd",
                          borderRadius: 4,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          width: "100%",
                          minHeight: 38,
                          boxSizing: "border-box",
                        }}
                      >
                        <span id="edit_dts_modified_date">{form.dts_modified_display || ""}</span>
                        <span id="edit_dts_modified_user" style={{ fontWeight: 600 }}>
                          {form.dts_modified_user_display || ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label style={{ fontWeight: 600, color: "#666" }}>DTS Created:</label>
                      <div
                        id="edit_dts_created"
                        style={{
                          backgroundColor: "#f5f5f5",
                          marginTop: 5,
                          padding: "8px 12px",
                          border: "1px solid #ddd",
                          borderRadius: 4,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          width: "100%",
                          minHeight: 38,
                          boxSizing: "border-box",
                        }}
                      >
                        <span id="edit_dts_created_date">{form.dts_created || ""}</span>
                        <span id="edit_dts_created_user" style={{ fontWeight: 600 }}>
                          {form.created_by || ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="add-col">
              <div className="form-row">
                <div className="form-group">
                  <label>Remove Words</label>
                  <input
                    value={form.remove_word}
                    onChange={(e) => setForm((prev) => ({ ...prev, remove_word: e.target.value }))}
                    placeholder="Enter words to remove"
                  />
                  <small className="field-help">(Use semicolon to separate multiple words, e.g. abc;cde;efg)</small>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <div className="day-use-header">
                    <label>Day Use</label>
                    <div className="all-day-checkbox">
                      <input
                        id="react_edit_all_day"
                        type="checkbox"
                        checked={days.length > 0 && form.day_use.length === days.length}
                        onChange={(e) => {
                          if (e.target.checked) setForm((prev) => ({ ...prev, day_use: days.map((d) => String(d.id)) }));
                          else setForm((prev) => ({ ...prev, day_use: [] }));
                        }}
                      />
                      <label htmlFor="react_edit_all_day">All Day</label>
                    </div>
                  </div>
                  <div className="day-checkboxes" id={editMode ? "edit_day_checkboxes" : "day_checkboxes"}>
                    {days.map((d) => {
                      const id = String(d.id);
                      const checked = form.day_use.includes(id);
                      return (
                        <label key={id} style={{ marginRight: 10 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm((prev) => ({
                                ...prev,
                                day_use: checked ? prev.day_use.filter((x) => x !== id) : [...prev.day_use, id],
                              }));
                            }}
                          />
                          {String(d.day_name || "")}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="form-row row-two-cols">
                <div className="form-group">
                  <label>Replace From</label>
                  <input
                    value={form.replace_word_from}
                    onChange={(e) => setForm((prev) => ({ ...prev, replace_word_from: e.target.value }))}
                    placeholder="Old word"
                  />
                  <small className="field-help">(Word to be replaced)</small>
                </div>
                <div className="form-group">
                  <label>Replace To</label>
                  <input
                    value={form.replace_word_to}
                    onChange={(e) => setForm((prev) => ({ ...prev, replace_word_to: e.target.value }))}
                    placeholder="New word"
                  />
                  <small className="field-help">(Replacement word)</small>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Remarks</label>
                  <textarea
                    rows={5}
                    value={form.remark}
                    onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
                    placeholder="Enter remarks..."
                  />
                </div>
              </div>
            </div>

            <div className="form-actions add-actions">
              <button type="submit" className="btn btn-save">
                {editMode ? "Update Process" : "Add Process"}
              </button>
              <button type="button" className="btn btn-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
