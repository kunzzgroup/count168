import { useEffect, useId, useMemo, useRef, useState } from "react";

function filterSuggestions(list, value) {
  const q = String(value || "").trim().toUpperCase();
  if (!q) return list;
  return list.filter((item) => String(item).toUpperCase().includes(q));
}

export default function LoginSuggestInput({
  id,
  iconClass,
  placeholder,
  value,
  onChange,
  suggestions = [],
  autoComplete = "off",
  type = "text",
  required = false,
}) {
  const listId = useId();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const visibleSuggestions = useMemo(
    () => filterSuggestions(suggestions, value),
    [suggestions, value],
  );

  const showMenu = open && visibleSuggestions.length > 0;

  useEffect(() => {
    if (!showMenu) return undefined;

    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showMenu]);

  const pick = (item) => {
    onChange({ target: { value: item } });
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (!showMenu) {
      if (e.key === "ArrowDown" && visibleSuggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % visibleSuggestions.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? visibleSuggestions.length - 1 : i - 1));
      return;
    }

    if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(visibleSuggestions[activeIndex]);
    }
  };

  return (
    <div className="sc-login-input-row" ref={wrapRef}>
      <i className={`${iconClass} sc-login-input-icon`} aria-hidden="true" />
      <input
        ref={inputRef}
        id={id}
        type={type}
        className="sc-login-input"
        placeholder={placeholder}
        required={required}
        value={value}
        autoComplete={autoComplete}
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={showMenu ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          showMenu && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
        }
        onChange={(e) => {
          onChange(e);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          /* close handled by pointerdown outside */
        }}
        onKeyDown={onKeyDown}
      />
      {showMenu ? (
        <ul id={listId} className="sc-login-suggest-menu" role="listbox">
          {visibleSuggestions.map((item, index) => (
            <li key={item} role="presentation">
              <button
                id={`${listId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className={`sc-login-suggest-option${activeIndex === index ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
