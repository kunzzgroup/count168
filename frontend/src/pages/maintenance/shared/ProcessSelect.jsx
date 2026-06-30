import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";

/**
 * Process dropdown for maintenance pages.
 * @param {"id"|"processName"} valueMode — capture uses DB id; formula/transaction use process_name
 */
export default function ProcessSelect({
  processes,
  selectedValue,
  onSelect,
  valueMode = "processName",
  placeholder = "--Select All--",
  unsetPlaceholder,
  ariaLabelledBy,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const useIdValue = valueMode === "id";
  const useTransactionSelectAll = valueMode === "processName" && unsetPlaceholder == null;

  const selectAllSeed = useTransactionSelectAll
    ? { id: null, process_name: placeholder }
    : { id: "", process_name: placeholder };

  const displayProcesses = useMemo(
    () => [selectAllSeed, ...(Array.isArray(processes) ? processes : [])],
    [processes, selectAllSeed],
  );

  const isSelectAllOption = useCallback(
    (process) => {
      if (useIdValue) {
        return !(process?.id != null && process.process_name !== placeholder);
      }
      if (useTransactionSelectAll) {
        return (
          process == null ||
          process.id == null ||
          process.id === "" ||
          process.process_name === placeholder
        );
      }
      return !(process?.id != null && process.process_name !== placeholder);
    },
    [placeholder, useIdValue, useTransactionSelectAll],
  );

  const getOptionText = useCallback(
    (p) => {
      if (isSelectAllOption(p)) return placeholder;
      if (useTransactionSelectAll) {
        const name = String(p.process_name ?? p.process ?? "").trim();
        return p.description ? `${name} (${p.description})` : name;
      }
      const name = String(p.process_name ?? p.process ?? "").trim();
      return name && name !== placeholder
        ? p.description
          ? `${name} (${p.description})`
          : name
        : placeholder;
    },
    [isSelectAllOption, placeholder, useTransactionSelectAll],
  );

  const getItemLabel = useCallback((idx) => getOptionText(displayProcesses[idx]), [displayProcesses, getOptionText]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open: isOpen,
    itemCount: displayProcesses.length,
    getItemLabel,
  });

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const resolveValue = (process) => {
    if (isSelectAllOption(process)) return "";
    if (useIdValue) return String(process.id);
    return String(process.process_name);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleSelect = (process) => {
    onSelect(resolveValue(process));
    setIsOpen(false);
  };

  const getDisplayText = (val) => {
    if (val === null || val === undefined) {
      return unsetPlaceholder || placeholder;
    }
    if (!val || val === placeholder) return placeholder;

    const list = Array.isArray(processes) ? processes : [];
    const p = useIdValue
      ? list.find((proc) => String(proc.id) === String(val))
      : list.find((proc) => String(proc.process_name ?? proc.process ?? "") === val);
    if (!p) return placeholder;
    return getOptionText(p) || placeholder;
  };

  return (
    <div className="custom-select-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`custom-select-button ${isOpen ? "open" : ""}`}
        onClick={handleToggle}
        aria-labelledby={ariaLabelledBy || undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onKeyDown={(e) => {
          handleButtonKeyDown(e, {
            isOpen,
            onToggleOpen: () => setIsOpen(true),
            onClose: () => setIsOpen(false),
            len: displayProcesses.length,
            onSelectIndex: (idx) => handleSelect(displayProcesses[idx]),
          });
        }}
      >
        {getDisplayText(selectedValue)}
      </button>

      {isOpen && (
        <div className="custom-select-dropdown show">
          <div className="custom-select-options" ref={listRef}>
            {displayProcesses.map((p, index) => (
              <div
                key={index}
                className={`custom-select-option ${selectedValue === resolveValue(p) ? "selected" : ""}${highlightClass(index)}`}
                data-kb-idx={index}
                onClick={() => handleSelect(p)}
                onMouseEnter={() => setHighlightIdx(index)}
              >
                {getOptionText(p)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
