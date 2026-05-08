import React, { useMemo } from "react";
import { toUpper } from "../accountLogic.js";

export default function LinkAccountModal({
  open,
  accounts,
  currentAccountId,
  selectedIds,
  setSelectedIds,
  linkType,
  setLinkType,
  searchTerm,
  setSearchTerm,
  onSave,
  onClose,
}) {
  if (!open) return null;

  const rows = useMemo(() => {
    const q = String(searchTerm || "").trim().toLowerCase();
    return (accounts || [])
      .filter((a) => Number(a.id) !== Number(currentAccountId))
      .filter((a) => {
        if (!q) return true;
        const text = `${a.account_id || ""} ${a.name || ""}`.toLowerCase();
        return text.includes(q);
      });
  }, [accounts, currentAccountId, searchTerm]);

  return (
    <div id="linkAccountModal" className="account-modal" style={{ display: "block" }}>
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>Link Account</h2>
          <span className="account-close" onClick={onClose}>&times;</span>
        </div>
        <div className="link-account-fixed-area">
          <div className="link-type-section">
            <div className="link-type-pills">
              <label className="link-type-pill">
                <input
                  type="radio"
                  name="linkType"
                  value="bidirectional"
                  checked={linkType === "bidirectional"}
                  onChange={() => setLinkType("bidirectional")}
                  className="link-type-radio"
                />
                <span className="link-type-pill-check">&#10003;</span>
                <span className="link-type-pill-text">Bidirectional</span>
              </label>
              <label className="link-type-pill">
                <input
                  type="radio"
                  name="linkType"
                  value="unidirectional"
                  checked={linkType === "unidirectional"}
                  onChange={() => setLinkType("unidirectional")}
                  className="link-type-radio"
                />
                <span className="link-type-pill-check">&#10003;</span>
                <span className="link-type-pill-text">Unidirectional</span>
              </label>
            </div>
            <p className="link-type-desc">
              {linkType === "bidirectional"
                ? "Bidirectional: Data syncs both ways."
                : "Unidirectional flows from A to B."}
            </p>
          </div>
          <div className="link-account-search-wrap">
            <div className="link-account-search-inner">
              <svg className="link-account-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="link-account-search-input"
                placeholder="Search account..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="account-modal-body link-account-modal-body">
          <div className="link-account-list">
            {rows.map((acc) => {
              const id = Number(acc.id);
              const checked = selectedIds.has(id);
              return (
                <label key={id} className={`link-account-item ${checked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    className="link-account-checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(id);
                        else next.delete(id);
                        return next;
                      })
                    }
                  />
                  <span>{toUpper(acc.account_id)} - {toUpper(acc.name)}</span>
                </label>
              );
            })}
            {rows.length === 0 && (
              <div className="currency-toggle-note">No accounts available to link.</div>
            )}
          </div>
        </div>
        <div className="account-form-actions link-account-form-actions">
          <button type="button" className="account-btn account-btn-save" onClick={onSave}>Save</button>
          <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
