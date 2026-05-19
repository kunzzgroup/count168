import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterBankPickAccounts, formatBankAccountDisplay } from "../bankProcessHelpers.js";

const PORTAL_MIN_WIDTH = 220;

function accountLabel(account) {
  if (!account) return "";
  return formatBankAccountDisplay(account.account_id, account.name, account.id);
}

export default function BankSearchableAccountPick({ value, onChange, accounts, disabled, t }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(320);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.max(rect.width, PORTAL_MIN_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom - 24;
    const spaceAbove = rect.top - 24;
    const searchHeight = 50;
    const openBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
    const maxOpt = Math.max(160, Math.min(320, (openBelow ? spaceBelow : spaceAbove) - searchHeight - 16));
    setOptionsMaxHeight(maxOpt);
    setMenuStyle({
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      top: openBelow ? `${rect.bottom + 2}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + 2}px`,
      zIndex: 10001,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !usePortal) return undefined;
    positionMenu();
    const onReflow = () => positionMenu();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, usePortal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const pickableAccounts = useMemo(() => filterBankPickAccounts(accounts), [accounts]);

  const filtered = useMemo(() => {
    const list = pickableAccounts;
    const qq = q.trim().toLowerCase();
    let rows = list;
    if (qq) {
      rows = list.filter((a) => accountLabel(a).toLowerCase().includes(qq));
    }
    return rows.slice().sort((a, b) => accountLabel(a).localeCompare(accountLabel(b), undefined, { sensitivity: "base" }));
  }, [pickableAccounts, q]);

  const selected = pickableAccounts.find((a) => String(a.id) === String(value));
  const placeholder = t("selectAccount");

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal");
    setUsePortal(inModal);
    setQ("");
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (id) => {
    onChange(id ? String(id) : "");
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
    >
      <div className="custom-select-search">
        <input
          ref={searchRef}
          type="text"
          placeholder={t("searchAccount")}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        />
      </div>
      <div className="custom-select-options" style={{ maxHeight: optionsMaxHeight }}>
        <div
          className={`custom-select-option${!value ? " selected" : ""}`}
          role="option"
          aria-selected={!value}
          onClick={() => pick("")}
        >
          {placeholder}
        </div>
        {filtered.length === 0 ? (
          <div className="custom-select-no-results">{t("noAccountsFound")}</div>
        ) : (
          filtered.map((a) => (
            <div
              key={a.id}
              className={`custom-select-option${String(value) === String(a.id) ? " selected" : ""}`}
              role="option"
              aria-selected={String(value) === String(a.id)}
              onClick={() => pick(a.id)}
            >
              {accountLabel(a)}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="custom-select-wrapper bank-searchable-account-pick" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
      >
        {selected ? accountLabel(selected) : placeholder}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
