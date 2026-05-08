import React from "react";
import AccountEditorRow from "./AccountEditorRow.jsx";
import GePartnerSection from "./GePartnerSection.jsx";

export default function GroupEarningCard({
  grp,
  expanded,
  loadingGid,
  geState,
  geSavingGid,
  onToggle,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  onConfirm,
  onCancel,
  onLinkPartner,
  calcTotal,
  readOnlyMode,
  fmtPct,
}) {
  const gid = grp.group_id;
  const alloc = parseFloat(grp.allocated_percentage) || 0;
  const st = geState;
  const totalLive = st ? calcTotal(st.rows) : alloc;

  let footerText = "100% Unallocated";
  let warn = { show: false, err: false, icon: "⚠️", msg: "" };
  let confirmDisabled = false;

  if (st) {
    const t = calcTotal(st.rows);
    const r = 100 - t;
    if (t > 100) {
      warn = { show: true, err: true, icon: "❌", msg: "Total exceeds 100%!" };
      footerText = `${Math.abs(r).toFixed(2)}% Over Allocated`;
      confirmDisabled = true;
    } else if (t < 100) {
      warn = { show: true, err: false, icon: "⚠️", msg: "Total is less than 100%" };
      footerText = `${r.toFixed(2)}% Unallocated`;
    } else footerText = "Fully Allocated";
  }

  return (
    <div
      id={`ge-card-${gid}`}
      className={`own-card ge-card${expanded ? " expanded" : ""}`}
      onClick={(e) => {
        const action = e.target.closest("[data-action]")?.dataset?.action;
        if (!action) return;
        e.stopPropagation();
        if (action === "toggle") onToggle(gid);
        else if (action === "add-row") onAddRow(gid);
        else if (action === "cancel") onCancel();
        else if (action === "confirm") onConfirm(gid);
      }}
      role="presentation"
    >
      <div className="own-card-header" style={{ cursor: "pointer" }} data-action="toggle" role="presentation">
        <div className="own-card-header-left">
          <div className="own-company-name">{gid}</div>
          {Array.isArray(grp.companies) && grp.companies.length > 0 && (
            <div className="own-company-date" style={{ marginTop: 2 }}>
              {grp.companies.map((c) => {
                const eq = parseFloat(c.group_equity) || 0;
                return eq > 0 ? `${c.name} (${fmtPct(eq)})` : c.name;
              }).join(", ")}
            </div>
          )}
        </div>
        <div className="own-card-header-middle">
          <div className="own-allocation-info">
            <span className="own-allocation-label">Total Allocation</span>
            <span className="own-allocation-percentage">{fmtPct(totalLive)}</span>
            <span className={`own-allocation-remaining${totalLive > 100 ? " own-over-limit" : ""}`}>
              {totalLive > 100 ? "Over limit!" : `${fmtPct(100 - totalLive)} Remaining`}
            </span>
          </div>
          <div className="own-progress-bar-container">
            <div
              className={`own-progress-bar-fill${totalLive > 100 ? " own-bar-danger" : ""}`}
              style={{ width: `${Math.min(totalLive, 100)}%` }}
            />
          </div>
        </div>
        <div className="own-card-header-right">
          <button type="button" className="own-btn-outline" data-action="toggle">
            Manage
          </button>
          <button type="button" className="own-icon-btn" data-action="toggle">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="own-card-body" id={`ge-card-body-${gid}`}>
        {expanded && loadingGid === gid && !st ? (
          <div className="own-loader-container">
            <div className="own-loader" />
          </div>
        ) : null}
        <div className={expanded && st ? "" : "own-editor-hidden"} id={`ge-editor-${gid}`}>
          {expanded && st ? (
            <>
              <div className="own-table-headers">
                <div>Account</div>
                <div>Ownership%</div>
              </div>
              <div id={`ge-rows-container-${gid}`}>
                {st.rows.map((row, idx) => (
                  <AccountEditorRow
                    key={`ge-${gid}-${idx}-${String(row.account_id)}-${row.ownership_id ?? "n"}`}
                    companyId={`ge-${gid}`}
                    idx={idx}
                    row={row}
                    accounts={st.accounts}
                    enableDrag={false}
                    onUpdate={(i, f, v) => onUpdateRow(gid, i, f, v)}
                    onRemove={(i) => onRemoveRow(gid, i)}
                    readOnlyMode={readOnlyMode}
                  />
                ))}
              </div>
              <button type="button" className="own-btn-add-account" data-action="add-row" disabled={readOnlyMode}>
                + Add Account
              </button>
              <GePartnerSection groupId={gid} disabled={readOnlyMode} onLink={(login) => onLinkPartner(login)} />
              <div className="own-card-footer">
                <div className="own-footer-left">
                  <div className={`own-warning-badge${warn.err ? " own-warning-error" : ""}`} style={{ display: warn.show ? "flex" : "none" }}>
                    <span>{warn.icon}</span>
                    <span>{warn.msg}</span>
                  </div>
                  <span className="own-unallocated-text">{footerText}</span>
                </div>
                <div className="own-footer-right">
                  <button type="button" className="own-footer-btn own-btn-cancel" data-action="cancel">
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="own-footer-btn own-btn-confirm"
                    data-action="confirm"
                    disabled={readOnlyMode || confirmDisabled || geSavingGid === gid}
                  >
                    {geSavingGid === gid ? "Saving..." : "Confirm"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
