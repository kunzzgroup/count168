import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import ReportDatePicker from "../common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../shared/ReportGcFilterPanel.jsx";
import { useListboxKeyboard } from "../../../components/useListboxKeyboard.js";

const QUICK_RANGE_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

export default function DomainReportFilters({
  companyId,
  highlightCompanyId,
  onSwitchCompany,
  onClearCompany,
  allowClearCompany = true,
  groupIds,
  selectedGroup,
  onPickGroup,
  onPickAllGroups,
  onPickAllInGroup,
  groupsAllMode = false,
  groupAllMode = false,
  companyButtons,
  processId,
  setProcessId,
  processes,
  isGroupScope = false,
  dateFrom,
  dateTo,
  onRangeChange,
  t,
  monthLabels,
  weekdaysShort,
}) {
  const [processDropdownOpen, setProcessDropdownOpen] = useState(false);

  const processDropdownRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (processDropdownRef.current && !processDropdownRef.current.contains(e.target)) setProcessDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const processOptions = useMemo(
    () => (isGroupScope ? [...processes] : [{ id: "", display_text: t("allProcess") }, ...processes]),
    [processes, isGroupScope, t],
  );

  const getItemLabel = useCallback((idx) => processOptions[idx]?.display_text ?? "", [processOptions]);

  const { highlightIdx, setHighlightIdx, listRef, handleButtonKeyDown, highlightClass } = useListboxKeyboard({
    open: processDropdownOpen,
    itemCount: processOptions.length,
    getItemLabel,
  });

  const selectedProcessLabel = useMemo(() => {
    if (!processId) return isGroupScope ? t("selectProcess") : t("allProcess");
    const found = processes.find((p) => String(p.id) === String(processId));
    if (found) return found.display_text;
    return isGroupScope ? t("selectProcess") : t("allProcess");
  }, [processes, processId, t, isGroupScope]);

  const periodPresets = useMemo(
    () => QUICK_RANGE_KEYS.map((key) => ({ key, label: t(key) })),
    [t],
  );

  return (
    <div className="domain-report-filter-container">
      <div className="domain-report-filters">
        <div className="domain-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span className="report-outlined-label" id="report-process-outlined-label">
              {t("process")}
            </span>
            <div className="report-outlined-inner">
              <div className="custom-select-wrapper" ref={processDropdownRef}>
                <button
                  type="button"
                  id="dr-process-dropdown-btn"
                  aria-labelledby="report-process-outlined-label"
                  className={`custom-select-button ${processDropdownOpen ? "open" : ""}`}
                  onClick={() => setProcessDropdownOpen(!processDropdownOpen)}
                  onKeyDown={(e) => {
                    handleButtonKeyDown(e, {
                      isOpen: processDropdownOpen,
                      onToggleOpen: () => setProcessDropdownOpen(true),
                      onClose: () => setProcessDropdownOpen(false),
                      len: processOptions.length,
                      onSelectIndex: (idx) => {
                        const p = processOptions[idx];
                        if (p) {
                          setProcessId(p.id);
                          setProcessDropdownOpen(false);
                        }
                      },
                    });
                  }}
                >
                  {selectedProcessLabel}
                </button>
                {processDropdownOpen && (
                  <div className="custom-select-dropdown show">
                    <div className="custom-select-options" ref={listRef}>
                      {processOptions.map((p, idx) => (
                        <div
                          key={p.id || "all"}
                          className={`custom-select-option ${String(p.id) === String(processId) ? "selected" : ""}${highlightClass(idx)}`}
                          data-kb-idx={idx}
                          onMouseEnter={() => setHighlightIdx(idx)}
                          onClick={() => { setProcessId(p.id); setProcessDropdownOpen(false); }}
                        >
                          {p.display_text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <ReportDatePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={onRangeChange}
          containerClass="domain-report-filter-group"
          label={t("dateRange")}
          placeholder={t("selectDateRange")}
          selectEndDateHint={t("selectEndDate")}
          outlinedFloatingLabel
          captureDateStyle
          periodPresets={periodPresets}
          periodShortcutsAria={t("periodShortcutsAria")}
          monthLabels={monthLabels}
          weekdaysShort={weekdaysShort}
        />
      </div>

      <ReportGcFilterPanel
        layout="dashboard"
        groupIds={groupIds}
        selectedGroup={selectedGroup}
        onPickGroup={onPickGroup}
        onPickAllGroups={onPickAllGroups}
        onPickAllInGroup={onPickAllInGroup}
        groupsAllMode={groupsAllMode}
        groupAllMode={groupAllMode}
        companyButtons={companyButtons}
        companyId={companyId}
        highlightCompanyId={highlightCompanyId}
        onSwitchCompany={onSwitchCompany}
        onClearCompany={onClearCompany}
        allowClearCompany={allowClearCompany}
        t={t}
      />
    </div>
  );
}
