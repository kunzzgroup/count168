import React from "react";
import ProcessModalPortal, { processModalBackdropStyle } from "../../../components/ProcessModalPortal.jsx";

export default function BankNoteModal({ bankFormNote, setBankFormNote, onSave, t }) {
  if (!bankFormNote) return null;
  return (
    <ProcessModalPortal>
    <div id="sopModal" className="modal bank-modal sop-modal" style={processModalBackdropStyle}>
      <div className="modal-content sop-modal-content">
        <div className="modal-header">
          <h2 id="processNoteModalTitle">{bankFormNote.kind === "sop" ? t("sop") : t("remark")}</h2>
          <span className="close" onClick={() => setBankFormNote(null)} role="presentation">&times;</span>
        </div>
        <div className="modal-body sop-modal-body">
          <textarea
            id="sop_content"
            placeholder={t("notePlaceholder")}
            className="bank-input sop-modal-textarea"
            value={bankFormNote.draft}
            onChange={(e) => setBankFormNote((n) => (n ? { ...n, draft: e.target.value } : n))}
          />
          <div className="form-actions bank-actions sop-modal-actions">
            <button type="button" className="btn btn-save" onClick={onSave}>{t("save")}</button>
            <button type="button" className="btn btn-cancel" onClick={() => setBankFormNote(null)}>{t("cancel")}</button>
          </div>
        </div>
      </div>
    </div>
    </ProcessModalPortal>
  );
}
