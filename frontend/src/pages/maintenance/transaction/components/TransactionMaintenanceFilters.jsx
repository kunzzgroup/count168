import { useMemo } from "react";
import ProcessSelect from "./ProcessSelect.jsx";
import ReportDatePicker from "../../../report/common/ReportDatePicker.jsx";
import ReportGcFilterPanel from "../../../report/components/ReportGcFilterPanel.jsx";

const QUICK_RANGE_KEYS = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];

function parseDmy(dmy) {
  const match = String(dmy || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function formatDmy(ymd) {
  const [y, m, d] = (ymd || "").split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export default function TransactionMaintenanceFilters({
  processes,
  selectedProcess,
  setSelectedProcess,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  today,
  companyId,
  companies,
  selectedGroup,
  onGroupClick,
  onSwitchCompany,
  m,
}) {
  const normalize = (value) => String(value || "").toUpperCase().trim();
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => normalize(c.group_id)))].sort();
  const dedupedCompanies = (() => {
    const byCode = new Map();
    for (const comp of snapCompanies) {
      const key = normalize(comp.company_id);
      const existing = byCode.get(key);
      if (!existing) {
        byCode.set(key, comp);
        continue;
      }
      const existingIsCurrent = Number(existing.id) === Number(companyId);
      const currentIsCurrent = Number(comp.id) === Number(companyId);
      if (!existingIsCurrent && currentIsCurrent) byCode.set(key, comp);
    }
    return Array.from(byCode.values());
  })();

  const visibleCompanies = useMemo(() => {
    return dedupedCompanies.filter((comp) => {
      const cGid = comp.group_id != null ? normalize(comp.group_id) : "";
      const isC168 = normalize(comp.company_id) === "C168";
      if (selectedGroup) return cGid === selectedGroup || isC168;
      return !cGid || isC168;
    });
  }, [dedupedCompanies, selectedGroup]);

  const periodPresets = useMemo(
    () => QUICK_RANGE_KEYS.map((key) => ({ key, label: m[key] || key })),
    [m],
  );

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span
              id="transaction-maintenance-process-legend"
              className="report-outlined-label"
            >
              {m.process}
            </span>
            <div className="report-outlined-inner">
              <ProcessSelect
                key={`process-select-${companyId ?? "none"}`}
                processes={processes}
                selectedValue={selectedProcess}
                onSelect={setSelectedProcess}
                placeholder={m.selectAllProcesses}
                searchPlaceholder={m.searchProcessPlaceholder}
                noResultsText={m.noResultsFound}
                ariaLabelledBy="transaction-maintenance-process-legend"
              />
            </div>
          </div>
        </div>

        <ReportDatePicker
          dateFrom={parseDmy(dateFrom || today)}
          dateTo={parseDmy(dateTo || today)}
          onRangeChange={(start, end) => {
            setDateFrom(formatDmy(start));
            setDateTo(formatDmy(end));
          }}
          containerClass="customer-report-filter-group"
          label={m.dateRange}
          placeholder={m.selectDateRange}
          selectEndDateHint={m.selectEndDate}
          outlinedFloatingLabel
          captureDateStyle
          periodPresets={periodPresets}
          periodShortcutsAria={m.period}
          monthLabels={m.monthsShort}
          weekdaysShort={m.weekdaysShort}
        />
      </div>

      <div className="maintenance-filter-row">
        <div className="maintenance-filter-left-full">
          <ReportGcFilterPanel
            groupIds={snapGroupIds}
            groupFilterKind={selectedGroup ? "follow" : "all"}
            selectedGroupKey={selectedGroup}
            onPickAllGroups={() => onGroupClick("")}
            onPickGroup={(g) => onGroupClick(g)}
            companyButtons={visibleCompanies}
            companyId={companyId}
            highlightCompanyId={companyId}
            onSwitchCompany={onSwitchCompany}
            t={(key) => {
              if (key === "groupId") return m.groupId;
              if (key === "company") return m.company;
              if (key === "groupFilterAll") return m.all || "All";
              return m[key] || key;
            }}
          />
        </div>
      </div>
    </div>
  );
}
