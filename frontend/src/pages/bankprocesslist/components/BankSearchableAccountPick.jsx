import React, { useEffect, useMemo, useRef, useState } from "react";

export default function BankSearchableAccountPick({ value, onChange, accounts, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);
  const filtered = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((a) => `${a.account_id || ""} ${a.name || ""}`.toLowerCase().includes(qq));
  }, [accounts, q]);
  const selected = (accounts || []).find((a) => String(a.id) === String(value));
  return (
    <div className="custom-select-wrapper" ref={wrapRef}>
      <button type="button" className="custom-select-button" disabled={disabled} onClick={() => !disabled && setOpen((o) => !o)}>
        {selected ? selected.account_id : "Select Account"}
      </button>
      {open ? (
        <div className="custom-select-dropdown" style={{ display: "block" }}>
          <div className="custom-select-search">
            <input type="text" placeholder="Search account..." autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="custom-select-options">
            {filtered.map((a) => (
              <div
                key={a.id}
                className={`custom-select-option${String(value) === String(a.id) ? " selected" : ""}`}
                role="presentation"
                onClick={() => {
                  onChange(String(a.id));
                  setOpen(false);
                  setQ("");
                }}
              >
                {a.account_id} — {a.name || "-"}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
