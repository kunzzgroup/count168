import React from "react";

export default function BankRemarkModal({ remarkDraft, setRemarkDraft, onSave, onClose, t }) {
  return (
    <div id="bankRemarkModal" className="modal bank-modal sop-modal" style={{ display: "block" }}>
      <div className="modal-content sop-modal-content">
        <div className="modal-header">
          <h2 id="processNoteModalTitle">{t("remark")}</h2>
          <span className="close" onClick={onClose} role="presentation">&times;</span>
        </div>
        <div className="modal-body sop-modal-body">
          <textarea
            id="bank_remark_inline"
            className="bank-input sop-modal-textarea"
            placeholder={t("notePlaceholder")}
            value={remarkDraft}
            onChange={(e) => setRemarkDraft(e.target.value)}
          />
          <div className="form-actions bank-actions sop-modal-actions">
            <button type="button" className="btn btn-save" onClick={() => void onSave()}>{t("save")}</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
