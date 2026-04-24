import React from "react";

export default function ProcessFormModal({
  editMode,
  form,
  setForm,
  descriptions,
  currencies,
  days,
  onClose,
  onSubmit,
  onOpenDescriptionPicker,
}) {
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
                    <select
                      value={form.copy_from || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, copy_from: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px" }}
                    >
                      <option value="">Select Process to Copy From</option>
                      {/* existingProcesses should be passed down, but fallback to descriptions if not */}
                      {form.existingProcesses?.map((p) => (
                        <option key={p.process_id} value={p.process_name}>
                          {p.process_name} {p.description_name ? `(${p.description_name})` : ''}
                        </option>
                      ))}
                    </select>
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
                              process_name: checked ? "" : prev.process_name
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
                <div className="form-row" id="multi_use_accounts">
                  <div className="form-group">
                    <label>Select Multi-use Processes</label>
                    <div className="process-checkboxes">
                      {form.existingProcesses?.map((p) => (
                        <div key={p.process_id} className="checkbox-item">
                          <input
                            type="checkbox"
                            id={`mp_${p.process_id}`}
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
                          <label htmlFor={`mp_${p.process_id}`}>{p.process_name}</label>
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
                <div className="form-row" id="selected_processes_row">
                  <div className="form-group">
                    <label>Selected Processes</label>
                    <div className="selected-processes">
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
                                  show_multi_process_selection: nextList.length === 0 ? true : false
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
                    <input
                      readOnly
                      placeholder="Click + to select descriptions"
                      style={{ backgroundColor: "#f5f5f5" }}
                    />
                    <button
                      type="button"
                      className="add-icon"
                      aria-label="Choose description"
                      onClick={onOpenDescriptionPicker}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ display: form.selected_descriptions?.length > 0 ? "block" : "none" }}>
                <div className="form-group">
                  <label>Selected Descriptions</label>
                  <div className="selected-descriptions">
                    {form.selected_descriptions?.map((desc) => (
                      <span key={desc.id} className="selected-description-tag">{desc.name}</span>
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

              <div className="form-row">
                <div className="form-group">
                  <label style={{ fontWeight: 600, color: "#666" }}>DTS Modified:</label>
                  <div
                    style={{
                      backgroundColor: "#f5f5f5",
                      marginTop: 5,
                      padding: "8px 12px",
                      border: "1px solid #ddd",
                      borderRadius: 4,
                      display: "flex",
                      justifyContent: "space-between",
                      minHeight: 38,
                    }}
                  >
                    <span>{form.dts_modified || ""}</span>
                    <span style={{ fontWeight: 600 }}>{form.modified_by || ""}</span>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label style={{ fontWeight: 600, color: "#666" }}>DTS Created:</label>
                  <div
                    style={{
                      backgroundColor: "#f5f5f5",
                      marginTop: 5,
                      padding: "8px 12px",
                      border: "1px solid #ddd",
                      borderRadius: 4,
                      display: "flex",
                      justifyContent: "space-between",
                      minHeight: 38,
                    }}
                  >
                    <span>{form.dts_created || ""}</span>
                    <span style={{ fontWeight: 600 }}>{form.created_by || ""}</span>
                  </div>
                </div>
              </div>
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
                  <small className="field-help">
                    (Use semicolon to separate multiple words, eg. abc;cde;efg)
                  </small>
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
                          if (e.target.checked)
                            setForm((prev) => ({ ...prev, day_use: days.map((d) => String(d.id)) }));
                          else setForm((prev) => ({ ...prev, day_use: [] }));
                        }}
                      />
                      <label htmlFor="react_edit_all_day">All Day</label>
                    </div>
                  </div>
                  <div className="day-checkboxes">
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
                                day_use: checked
                                  ? prev.day_use.filter((x) => x !== id)
                                  : [...prev.day_use, id],
                              }));
                            }}
                          />
                          {String(d.day_name || "").toUpperCase()}
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

              {editMode && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="active">ACTIVE</option>
                      <option value="inactive">INACTIVE</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Remarks</label>
                  <textarea
                    rows={4}
                    value={form.remark}
                    onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
                    placeholder="ENTER REMARKS..."
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
