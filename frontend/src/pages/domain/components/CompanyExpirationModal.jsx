import { calculateCountdown, formatDate } from "../domainHelpers.js";

/**
 * Company Expiration Status Modal (read-only view)
 * Props:
 *   companies: Array<{ company_id, expiration_date }>
 *   onClose()
 */
export default function CompanyExpirationModal({ companies, onClose }) {
  return (
    <div className="modal" style={{ display: "block", zIndex: 10002 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: 600 }}>
        <span className="close" onClick={onClose}>&times;</span>
        <h2>Company Expiration Status</h2>
        <div className="modal-body" style={{ display: "block", padding: "clamp(10px,1.04vw,20px) clamp(20px,1.67vw,32px)" }}>
          <div style={{ minHeight: 100, maxHeight: 400, overflowY: "auto" }}>
            {!companies || companies.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>
                No companies found
              </div>
            ) : (
              companies.map((company) => {
                const expDate = company.expiration_date || null;
                const countdown = expDate ? calculateCountdown(expDate) : null;
                const formattedDate = expDate ? formatDate(expDate) : "No expiration date";

                let statusClass = "normal";
                let statusText = "Valid";
                if (countdown) {
                  statusClass = countdown.status;
                  statusText = countdown.text;
                } else if (!expDate) {
                  statusClass = "warning";
                  statusText = "No date set";
                }

                return (
                  <div key={company.company_id} className="company-exp-item">
                    <div className="company-exp-item-left">
                      <div className="company-exp-id">{company.company_id}</div>
                      <div className="company-exp-date">Expiration: {formattedDate}</div>
                    </div>
                    <div className={`company-exp-status ${statusClass}`}>{statusText}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
