import React from "react";

export default function DescriptionPickerModal({ descriptions, form, pickDescription, onClose }) {
  return (
    <div
      className="modal"
      style={{ display: "block", zIndex: 10050 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="descPickerTitle"
    >
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 id="descPickerTitle">Select description</h2>
          <span className="close" onClick={onClose} role="presentation">
            &times;
          </span>
        </div>
        <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {descriptions.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>No descriptions available.</p>
          ) : (
            descriptions.map((d) => (
              <button
                key={d.id}
                type="button"
                className="description-item"
                onClick={() => pickDescription(d)}
                style={{
                  width: "100%",
                  border: "1px solid #e9ecef",
                  background: String(form.description_id) === String(d.id) ? "#e7f1ff" : "#fff",
                  borderRadius: 4,
                  marginBottom: 8,
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 14,
                }}
              >
                <span className="description-item-left" style={{ textTransform: "uppercase" }}>
                  {String(d.name || "").trim() || `ID ${d.id}`}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
