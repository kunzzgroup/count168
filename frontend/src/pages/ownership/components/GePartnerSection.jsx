import React, { useState } from "react";

export default function GePartnerSection({ groupId, onLink, disabled = false }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="own-partner-section">
      <div className="own-partner-info">
        <div className="own-partner-title-row">
          <span className="own-partner-title">External Partner</span>
          <div className="own-partner-actions">
            <input
              id={`ge-partner-login-${groupId}`}
              type="text"
              className="own-partner-input"
              placeholder="Login ID/Group ID"
              autoComplete="off"
              value={val}
              disabled={disabled}
              onChange={(e) => setVal(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="own-partner-link-btn"
              disabled={busy || disabled}
              onClick={async () => {
                const login = val.trim();
                if (!login) return;
                setBusy(true);
                const ok = await onLink(login);
                setBusy(false);
                if (ok) setVal("");
              }}
            >
              {busy ? "Linking..." : "Link Partner"}
            </button>
          </div>
        </div>
        <span className="own-partner-desc">
          Share this group&apos;s read-only dashboard visibility with another independent owner.
        </span>
      </div>
    </div>
  );
}
