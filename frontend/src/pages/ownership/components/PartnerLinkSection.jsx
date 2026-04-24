import React, { useState } from "react";

export default function PartnerLinkSection({ inputId, onLink }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="own-partner-section">
      <div className="own-partner-info">
        <div className="own-partner-title-row">
          <span className="own-partner-title">External Partner</span>
          <div className="own-partner-actions">
            <input
              id={inputId}
              type="text"
              className="own-partner-input"
              placeholder="Login ID/Group ID"
              autoComplete="off"
              autoCapitalize="characters"
              value={val}
              onChange={(e) => setVal(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="own-partner-link-btn"
              disabled={busy}
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
          Share this company&apos;s read-only dashboard visibility with another independent owner.
        </span>
      </div>
    </div>
  );
}
