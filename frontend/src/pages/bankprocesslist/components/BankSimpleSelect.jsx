import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PORTAL_MIN_WIDTH = 180;

export default function BankSimpleSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "",
  disabled = false,
  includeEmptyOption = true,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [usePortal, setUsePortal] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(280);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.max(rect.width, PORTAL_MIN_WIDTH);
    const spaceBelow = window.innerHeight - rect.bottom - 24;
    const spaceAbove = rect.top - 24;
    const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxOpt = Math.max(120, Math.min(320, (openBelow ? spaceBelow : spaceAbove) - 16));
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

  const selected = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selected ? selected.label : placeholder;

  const openDropdown = () => {
    if (disabled) return;
    const inModal = !!wrapRef.current?.closest("#addBankModal, #profitSharingModal, #confirmBankResendModal");
    setUsePortal(inModal);
    setOpen(true);
    if (inModal) positionMenu();
  };

  const pick = (nextValue) => {
    onChange(nextValue);
    close();
  };

  const dropdownNode = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown show${usePortal ? " custom-select-dropdown-portal" : ""}`}
      style={usePortal && menuStyle ? menuStyle : undefined}
      role="listbox"
      id={id ? `${id}_dropdown` : undefined}
    >
      <div className="custom-select-options" style={{ maxHeight: optionsMaxHeight }}>
        {includeEmptyOption ? (
          <div
            className={`custom-select-option${!value ? " selected" : ""}`}
            role="option"
            aria-selected={!value}
            onClick={() => pick("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") pick("");
            }}
          >
            {placeholder}
          </div>
        ) : null}
        {options.map((opt) => (
          <div
            key={opt.value}
            className={`custom-select-option${
              String(opt.value) === String(value) ? " selected" : ""
            }${opt.disabled ? " custom-select-option--disabled" : ""}`}
            role="option"
            aria-selected={String(opt.value) === String(value)}
            aria-disabled={opt.disabled || undefined}
            onClick={() => {
              if (opt.disabled) return;
              pick(opt.value);
            }}
            onKeyDown={(e) => {
              if (opt.disabled) return;
              if (e.key === "Enter" || e.key === " ") pick(opt.value);
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`custom-select-wrapper bank-simple-select${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : openDropdown())}
      >
        {displayLabel}
      </button>
      {open ? (usePortal ? createPortal(dropdownNode, document.body) : dropdownNode) : null}
    </div>
  );
}
