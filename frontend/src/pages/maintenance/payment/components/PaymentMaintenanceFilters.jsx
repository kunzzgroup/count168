import { useMemo } from "react";
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

export default function PaymentMaintenanceFilters({
  transactionType,
  setTransactionType,
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
  currencies,
  selectedCurrency,
  setSelectedCurrency,
  onDelete,
  confirmDelete,
  setConfirmDelete,
  deleteDisabled,
  m,
}) {
  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  const visibleCompanies = useMemo(() => {
    return snapCompanies.filter((comp) => {
      const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
      if (selectedGroup) return cGid === selectedGroup;
      return true;
    });
  }, [snapCompanies, selectedGroup]);

  const periodPresets = useMemo(
    () => QUICK_RANGE_KEYS.map((key) => ({ key, label: m[key] || key })),
    [m],
  );

  return (
    <div className="customer-report-filter-container">
      <div className="customer-report-filters">
        <div className="customer-report-filter-group report-outlined-anchor">
          <div className="report-outlined-shell">
            <span id="payment-maint-type-legend" className="report-outlined-label">
              {m.transactionType}
            </span>
            <div className="report-outlined-inner">
              <select
                id="filter_transaction_type"
                className="maintenance-select"
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                aria-labelledby="payment-maint-type-legend"
              >
                <option value="">{m.allTypes}</option>
                <option value="CONTRA">CONTRA</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="RECEIVE">RECEIVE</option>
                <option value="CLAIM">CLAIM</option>
                <option value="ADJUSTMENT">ADJUSTMENT</option>
                <option value="RATE">RATE</option>
              </select>
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

        <div className="maintenance-actions-top">
          <button
            type="button"
            className="maintenance-delete-btn"
            id="deleteBtn"
            onClick={onDelete}
            disabled={deleteDisabled}
          >
            {m.delete}
          </button>
        </div>
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
            currencyList={currencies}
            showAllCurrencies={!selectedCurrency}
            selectedCurrencies={selectedCurrency ? [selectedCurrency] : []}
            toggleAllCurrencies={() => setSelectedCurrency("")}
            toggleCurrency={(code) => setSelectedCurrency(code)}
            t={(key) => {
              if (key === "groupId") return m.groupId;
              if (key === "company") return m.company;
              if (key === "currency") return m.currency;
              if (key === "groupFilterAll") return m.all || "All";
              return m[key] || key;
            }}
          />
        </div>
      </div>
    </div>
  );
}
