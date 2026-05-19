/**
 * Empty shell for legacy showEditFormulaForm — form HTML is still injected by datacapturesummary.js.
 */
export default function EditFormulaModalHost() {
  return (
    <div id="editFormulaModal" className="summary-modal" style={{ display: "none" }}>
      <div className="summary-confirm-modal-content" id="editFormulaModalContent" />
    </div>
  );
}
