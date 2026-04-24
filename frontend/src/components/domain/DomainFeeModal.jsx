import { useState, useEffect } from "react";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { formatDomainFeeDisplay2, formatDomainFeeEdit2 } from "../../pages/domainHelpers.js";

/**
 * Fee Settings Modal — Price setting for domain list
 * Props:
 *   onClose()
 *   onFeeSaved(data) — called after successful save with { price }
 */
export default function DomainFeeModal({ onClose, onFeeSaved }) {
  const [price, setPrice] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_domain_fee_settings" }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const p2 = formatDomainFeeDisplay2(res.data.price);
          setSummary(`Display: Price ${p2}`);
          setPrice(formatDomainFeeEdit2(res.data.price));
        } else {
          showDomainAlert(res.message || "Could not load settings", "danger");
        }
      })
      .catch(() => showDomainAlert("Could not load settings", "danger"));
  }, []);

  function handleSave() {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_domain_fee_settings", price }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          showDomainAlert(res.message || "Saved");
          if (res.data) onFeeSaved(res.data);
          onClose();
        } else {
          showDomainAlert(res.message || "Save failed", "danger");
        }
      })
      .catch(() => showDomainAlert("Save failed", "danger"));
  }

  return (
    <div className="modal" style={{ display: "block", zIndex: 10004 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: 440 }}>
        <span className="close" onClick={onClose}>&times;</span>
        <h2>Price</h2>
        <div className="modal-body" style={{ display: "block", padding: "clamp(10px,1.04vw,20px) clamp(20px,1.67vw,32px)" }}>
          <p style={{ color: "#64748b", fontSize: "clamp(10px,0.78vw,14px)", margin: "0 0 10px 0" }}>
            Set default amounts for the domain list (saved for C168 admin use).
          </p>
          <div className="domain-fee-summary-display" aria-live="polite"
            dangerouslySetInnerHTML={{ __html: summary }} />
          <p className="domain-fee-edit-hint">Edit fields below support up to 2 decimal places.</p>
          <div className="form-group">
            <label htmlFor="domainFeePrice">
              Price <span className="domain-fee-decimals-hint">(edit)</span>
            </label>
            <input
              type="number"
              id="domainFeePrice"
              className="form-group input"
              step="0.01"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ width: "100%", padding: "clamp(5px,0.42vw,8px) clamp(6px,0.63vw,12px)", border: "1px solid #d1d5db", borderRadius: "clamp(4px,0.42vw,8px)", fontSize: "clamp(10px,0.83vw,16px)", boxSizing: "border-box" }}
            />
          </div>
          <div className="form-actions" style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-save" onClick={handleSave}>Save</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
