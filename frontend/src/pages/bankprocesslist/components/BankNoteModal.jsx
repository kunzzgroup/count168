import React from "react";

export default function BankNoteModal({ bankFormNote, setBankFormNote, onSave }) {
  if (!bankFormNote) return null;
  return (
    <div id="sopModal" className="modal bank-modal sop-modal" style={{ display: "block" }}>
      <div className="modal-content sop-modal-content">
        <div className="modal-header">
          <h2 id="processNoteModalTitle">{bankFormNote.kind === "sop" ? "SOP" : "Remark"}</h2>
          <span className="close" onClick={() => setBankFormNote(null)} role="presentation">&times;</span>
        </div>
        <div className="modal-body sop-modal-body">
          <textarea
            id="sop_content"
            placeholder="Enter notes for this process..."
            className="bank-input sop-modal-textarea"
            value={bankFormNote.draft}
            onChange={(e) => setBankFormNote((n) => (n ? { ...n, draft: e.target.value } : n))}
          />
          <div className="form-actions bank-actions sop-modal-actions">
            <button type="button" className="btn btn-save" onClick={onSave}>Save</button>
            <button type="button" className="btn btn-cancel" onClick={() => setBankFormNote(null)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
