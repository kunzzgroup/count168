import { useCallback, useEffect } from "react";
import {
  loadStoredRemoveWordChips,
  mergeRemoveWordChips,
  parseRemoveWordChips,
  saveStoredRemoveWordChips,
  serializeRemoveWordChips,
} from "../lib/removeWordChips.js";

/** Plain text Remove Word field (`sad,aa,aaa`). Chips UI removed — copyable + usable. */
export default function RemoveWordChipInput({
  value,
  onChange,
  processId = null,
  scopeCompanyId = null,
  id = "capture_remove_word",
  name = "remove_word",
  placeholder = "",
  disabled = false,
}) {
  const commitNormalized = useCallback(
    (raw) => {
      if (disabled) return;
      const next = serializeRemoveWordChips(parseRemoveWordChips(raw));
      onChange?.(next);
      if (processId) {
        const chips = parseRemoveWordChips(next);
        if (chips.length) {
          saveStoredRemoveWordChips(scopeCompanyId, processId, chips);
        }
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

  useEffect(() => {
    if (disabled) return;
    const next = serializeRemoveWordChips(parseRemoveWordChips(value));
    if (value && next !== value) {
      onChange?.(next);
    }
  }, [disabled, onChange, value]);

  return (
    <input
      type="text"
      id={id}
      name={name}
      className="dc-remove-word-chip-input__field"
      value={value ?? ""}
      disabled={disabled}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => {
        if (disabled) return;
        onChange?.(event.target.value);
      }}
      onBlur={(event) => commitNormalized(event.target.value)}
    />
  );
}
