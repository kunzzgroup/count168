import React, { useEffect, useRef, useState } from "react";
import { deriveBankProcessUiStatus, normalizeBankIssueFlag, normalizeBankProcessStatus } from "../bankProcessHelpers.js";

export default function BankProcessStatusControl({ row, onUpdated, notify: doNotify, buildApiUrl: apiUrl }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const ui = deriveBankProcessUiStatus(row);
  const pillClass = `bank-status-button is-${ui.toLowerCase().replace(/_/g, "-")}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const postIssueFlag = async (id, issueFlag) => {
    const fd = new FormData();
    fd.append("id", String(id));
    fd.append("issue_flag", issueFlag);
    const res = await fetch(apiUrl("api/processes/update_bank_issue_flag_api.php"), { method: "POST", body: fd, credentials: "include" });
    return res.json();
  };

  const postToggle = async (id) => {
    const fd = new FormData();
    fd.append("id", String(id));
    fd.append("permission", "Bank");
    const res = await fetch(apiUrl("api/processes/toggle_process_status_api.php"), { method: "POST", body: fd, credentials: "include" });
    return res.json();
  };

  const apply = async (target) => {
    const id = row.id;
    const st = normalizeBankProcessStatus(row?.status);
    const hasFlag = !!normalizeBankIssueFlag(row.issue_flag);
    try {
      if (target === "ACTIVE") {
        if (hasFlag) {
          const j = await postIssueFlag(id, "");
          if (!j.success) return doNotify(j.message || j.error || "Clear flag failed", "danger");
        }
        if (st !== "active") {
          const j = await postToggle(id);
          if (!j.success) return doNotify(j.message || j.error || "Status update failed", "danger");
        }
      } else if (target === "INACTIVE") {
        if (hasFlag) {
          const j = await postIssueFlag(id, "");
          if (!j.success) return doNotify(j.message || j.error || "Clear flag failed", "danger");
        }
        if (st === "active") {
          const j = await postToggle(id);
          if (!j.success) return doNotify(j.message || j.error || "Status update failed", "danger");
        }
      } else if (target === "OFFICIAL") {
        const j = await postIssueFlag(id, "official");
        if (!j.success) return doNotify(j.message || j.error || "Update failed", "danger");
      } else if (target === "E_INVOICE") {
        const j = await postIssueFlag(id, "e_invoice");
        if (!j.success) return doNotify(j.message || j.error || "Update failed", "danger");
      } else if (target === "BLOCK") {
        const j = await postIssueFlag(id, "block");
        if (!j.success) return doNotify(j.message || j.error || "Update failed", "danger");
      }
      doNotify("Status updated", "success");
      onUpdated();
      setOpen(false);
    } catch {
      doNotify("Status update failed", "danger");
    }
  };

  const options = ["ACTIVE", "INACTIVE", "OFFICIAL", "E_INVOICE", "BLOCK"];
  const label = ui === "E_INVOICE" ? "E-INVOICE" : ui;

  return (
    <div className={`bank-status-dropdown${open ? " open" : ""}`} ref={wrapRef}>
      <button type="button" className={`${pillClass}${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open ? (
        <div
          className="bank-status-menu"
          role="listbox"
          style={{ display: "flex", flexDirection: "column", alignItems: "stretch", whiteSpace: "normal", minWidth: 118 }}
        >
          {options.map((opt) => {
            const optLabel = opt === "E_INVOICE" ? "E-INVOICE" : opt;
            const cur = ui === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`bank-status-option${cur ? " selected" : ""}`}
                onClick={() => void apply(opt)}
                data-value={opt.toLowerCase()}
                style={{ display: "block", width: "100%" }}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
