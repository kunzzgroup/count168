import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStoredRemoveWordChips,
  mergeRemoveWordChips,
  parseRemoveWordChips,
  saveStoredRemoveWordChips,
  serializeRemoveWordChips,
} from "../lib/removeWordChips.js";

function normalizeDraft(value) {
  return String(value ?? "");
}

function selectElementText(el) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export default function RemoveWordChipInput({
  value,
  onChange,
  processId = null,
  scopeCompanyId = null,
  id = "capture_remove_word",
  name = "remove_word",
  placeholder = "",
  removeChipAriaLabel = "Remove",
  disabled = false,
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const bulkRef = useRef(null);
  const chips = parseRemoveWordChips(value);
  const serialized = serializeRemoveWordChips(chips);

  const commitChips = useCallback(
    (nextChips) => {
      if (disabled) return;
      const next = serializeRemoveWordChips(nextChips);
      onChange?.(next);
      if (processId) {
        saveStoredRemoveWordChips(scopeCompanyId, processId, nextChips);
      }
    },
    [disabled, onChange, processId, scopeCompanyId],
  );

  useEffect(() => {
    if (!processId || disabled) return;
    const fromValue = parseRemoveWordChips(value);
    const stored = loadStoredRemoveWordChips(scopeCompanyId, processId);
    const merged = mergeRemoveWordChips(fromValue, stored);
    const next = serializeRemoveWordChips(merged);
    if (next !== serializeRemoveWordChips(fromValue)) {
      onChange?.(next);
    }
    if (merged.length) {
      saveStoredRemoveWordChips(scopeCompanyId, processId, merged);
    }
  }, [processId, scopeCompanyId, value, onChange, disabled]);

  // Normalize legacy `;` values to comma form when loaded.
  useEffect(() => {
    if (disabled) return;
    const next = serializeRemoveWordChips(parseRemoveWordChips(value));
    if (value && next !== value) {
      onChange?.(next);
    }
  }, [disabled, onChange, value]);

  const addDraftWord = useCallback(() => {
    if (disabled) return;
    const word = normalizeDraft(draft.trim());
    if (!word) return;
    const exists = chips.some((chip) => chip.toLowerCase() === word.toLowerCase());
    if (exists) {
      setDraft("");
      return;
    }
    commitChips([...chips, word]);
    setDraft("");
  }, [chips, commitChips, disabled, draft]);

  const removeChip = useCallback(
    (index) => {
      if (disabled) return;
      commitChips(chips.filter((_, i) => i !== index));
    },
    [chips, commitChips, disabled],
  );

  const handleContainerClick = (event) => {
    if (disabled) return;
    if (event.target.closest(".dc-remove-word-chip")) return;
    if (event.target.closest(".dc-remove-word-chip-input__bulk")) return;
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && chips.length > 0) {
      event.preventDefault();
      selectElementText(bulkRef.current);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      addDraftWord();
      return;
    }
    if (event.key === ";" || event.key === ",") {
      event.preventDefault();
      addDraftWord();
      return;
    }
    if (event.key === "Backspace" && draft === "" && chips.length > 0) {
      event.preventDefault();
      commitChips(chips.slice(0, -1));
    }
  };

  const inputStyle =
    chips.length === 0
      ? { flex: "1 1 0", minWidth: "4ch" }
      : { flex: "0 1 auto", width: `${Math.max(draft.length + 1, 4)}ch` };

  return (
    <div
      className={`dc-remove-word-chip-input${disabled ? " is-disabled" : ""}`}
      onClick={handleContainerClick}
    >
      {chips.map((chip, index) => (
        <span
          key={`${chip}-${index}`}
          className="dc-remove-word-chip"
          onMouseDown={(event) => {
            if (event.target.closest(".dc-remove-word-chip__remove")) return;
            event.stopPropagation();
          }}
        >
          <span className="dc-remove-word-chip__label">{chip}</span>
          {!disabled ? (
            <button
              type="button"
              className="dc-remove-word-chip__remove"
              aria-label={`${removeChipAriaLabel} ${chip}`}
              onClick={(event) => {
                event.stopPropagation();
                removeChip(index);
              }}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {!disabled ? (
        <input
          ref={inputRef}
          type="text"
          id={id}
          name={name}
          className="dc-remove-word-chip-input__field"
          value={draft}
          placeholder={chips.length ? "" : placeholder}
          style={inputStyle}
          onChange={(event) => setDraft(normalizeDraft(event.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={addDraftWord}
          autoComplete="off"
        />
      ) : null}
      {chips.length > 0 ? (
        <span
          ref={bulkRef}
          className="dc-remove-word-chip-input__bulk"
          title={serialized}
          onClick={(event) => {
            event.stopPropagation();
            selectElementText(event.currentTarget);
          }}
        >
          {serialized}
        </span>
      ) : null}
    </div>
  );
}
