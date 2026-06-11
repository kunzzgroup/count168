import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PORTAL_EDGE_PAD = 16;
const PORTAL_GAP = 2;
const PROCESS_SEARCH_RESERVE = 52;
const PORTAL_DROPDOWN_CAP = 300;

function layoutProcessPortalDropdown(buttonEl, { searchReserve = PROCESS_SEARCH_RESERVE, minMenu = 160, dropdownCap = PORTAL_DROPDOWN_CAP }) {
  const rect = buttonEl.getBoundingClientRect();
  const width = rect.width;
  const spaceBelow = window.innerHeight - rect.bottom - PORTAL_EDGE_PAD;
  const spaceAbove = rect.top - PORTAL_EDGE_PAD;
  const openBelow = spaceBelow >= minMenu || spaceBelow >= spaceAbove;
  const viewportFit = Math.max(minMenu, openBelow ? spaceBelow : spaceAbove);
  const dropdownMaxHeight = Math.min(dropdownCap, viewportFit);
  const optionsMaxHeight = Math.max(100, dropdownMaxHeight - searchReserve);

  return {
    optionsMaxHeight,
    menuStyle: {
      position: "fixed",
      left: `${rect.left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${dropdownMaxHeight}px`,
      display: "flex",
      flexDirection: "column",
      top: openBelow ? `${rect.bottom + PORTAL_GAP}px` : "auto",
      bottom: openBelow ? "auto" : `${window.innerHeight - rect.top + PORTAL_GAP}px`,
      zIndex: 9000,
    },
  };
}

export default function DataCaptureProcessSelect({
  t,
  processOpen,
  setProcessOpen,
  selectedProcess,
  processFilter,
  setProcessFilter,
  processSearchInputRef,
  processListTruncated,
  processRowsCount,
  visibleProcesses,
  filteredProcesses,
  selectProcessRow,
  displayTextFromProcessRow,
  onBeforeToggle,
}) {
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(250);

  const positionMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const { menuStyle: nextMenuStyle, optionsMaxHeight: nextOptionsMaxHeight } = layoutProcessPortalDropdown(btn);
    setOptionsMaxHeight(nextOptionsMaxHeight);
    setMenuStyle(nextMenuStyle);
  }, []);

  useLayoutEffect(() => {
    if (!processOpen) {
      setMenuStyle(null);
      return undefined;
    }
    positionMenu();
    const onReflow = () => positionMenu();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [processOpen, positionMenu]);

  const handleToggle = (e) => {
    e.stopPropagation();
    onBeforeToggle?.();
    setProcessOpen((open) => !open);
  };

  const dropdownNode =
    processOpen && menuStyle ? (
      <div
        ref={dropdownRef}
        className="custom-select-dropdown show custom-select-dropdown-portal dc-process-select-portal"
        id="capture_process_dropdown"
        style={menuStyle}
      >
        <div className="custom-select-search">
          <input
            ref={processSearchInputRef}
            type="text"
            placeholder={t("searchProcess")}
            autoComplete="off"
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setProcessOpen(false);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const first = filteredProcesses[0];
                if (first) void selectProcessRow(first);
              }
            }}
          />
        </div>
        <div
          className="custom-select-options dc-react-process-options"
          style={{ flex: "1 1 auto", minHeight: 0, maxHeight: optionsMaxHeight }}
        >
          {processListTruncated ? (
            <div
              className="custom-select-option custom-select-option--hint"
              style={{ cursor: "default", opacity: 0.85 }}
            >
              {t("typeToSearchProcesses", { count: processRowsCount })}
            </div>
          ) : null}
          {visibleProcesses.map((row) => (
            <div
              key={row.id}
              role="presentation"
              className="custom-select-option"
              onClick={() => void selectProcessRow(row)}
            >
              {displayTextFromProcessRow(row)}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="custom-select-wrapper" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`custom-select-button${processOpen ? " open" : ""}`.trim()}
        id="capture_process"
        data-placeholder={t("selectProcess")}
        name="process"
        aria-expanded={processOpen}
        aria-haspopup="listbox"
        {...(selectedProcess?.id
          ? {
              "data-value": selectedProcess.id,
              "data-process-code": selectedProcess.process_id || "",
              ...(selectedProcess.description_name
                ? { "data-description-name": selectedProcess.description_name }
                : {}),
            }
          : {})}
        onClick={handleToggle}
      >
        {selectedProcess?.displayText || t("selectProcess")}
      </button>
      {dropdownNode ? createPortal(dropdownNode, document.body) : null}
    </div>
  );
}
