import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useIncrementalList } from "../../hooks/useIncrementalList.js";
import { useMaintenanceSession } from "../../hooks/useMaintenanceSession.js";
import {
  bankProcessDisplayStatus,
  bankTypeLabel,
  companyHasBankPermission,
  fetchBankProcessList,
  filterBankProcessRowsByDate,
  filterBankProcessRowsBySearch,
  formatBankMoney,
  matchesBankProcessStatusFilters,
} from "../../lib/bankProcessApi.js";
import { periodPresetRange } from "../../lib/dashboardDateUtils.js";
import {
  maintenanceScopeIsReady,
  maintenanceScopeKey,
} from "../../lib/mobileMaintenanceScope.js";
import { canAccessBankProcess } from "../../utils/mobilePermissions.js";
import { MaintenanceFilterBar, MaintenanceFilterSheet } from "../maintenance/MaintenanceSheets.jsx";
import "../maintenance/maintenance.css";
import "./bankprocess.css";

const DEFAULT_STATUS = {
  showActive: true,
  showInactive: false,
  showOfficial: false,
  showEInvoice: false,
  showBlock: false,
};

function statusToneClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "is-active";
  if (s === "INACTIVE") return "is-inactive";
  if (s === "OFFICIAL") return "is-official";
  if (s === "E-INVOICE" || s === "E_INVOICE") return "is-einvoice";
  if (s === "BLOCK") return "is-block";
  return "is-inactive";
}

function rowKey(row, idx) {
  return String(row?.id ?? row?.process_id ?? `${row?.card_lower}-${row?.bank}-${idx}`);
}

export default function BankProcessListPage() {
  const s = useMaintenanceSession({ canAccess: canAccessBankProcess });
  const { i18n, scope } = s;

  const yearRange = periodPresetRange("thisYear") || { dateFrom: "", dateTo: "" };
  const [dateFrom, setDateFrom] = useState(yearRange.dateFrom);
  const [dateTo, setDateTo] = useState(yearRange.dateTo);
  const [activePreset, setActivePreset] = useState("thisYear");
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("");
  const [statusFilters, setStatusFilters] = useState(DEFAULT_STATUS);
  const [rows, setRows] = useState([]);
  const [currencyCodes, setCurrencyCodes] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [bankReady, setBankReady] = useState(false);

  const seqRef = useRef(0);
  const bankCacheRef = useRef(new Map());
  const scopeReady = maintenanceScopeIsReady(scope);
  const scopeCacheKey = maintenanceScopeKey(scope);

  /** Prefer a Bank-category company when session lands on Games-only. */
  useEffect(() => {
    if (!s.me || s.loading || !s.companies.length) return undefined;
    const ac = new AbortController();
    (async () => {
      const currentCode = String(s.selectedCompany?.company_id || "").trim();
      if (currentCode) {
        const ok = await companyHasBankPermission(currentCode, ac.signal);
        if (ac.signal.aborted) return;
        if (ok) {
          setBankReady(true);
          return;
        }
      }
      for (const c of s.companies) {
        const code = String(c.company_id || "").trim();
        if (!code) continue;
        let hit = bankCacheRef.current.get(code);
        if (hit === undefined) {
          hit = await companyHasBankPermission(code, ac.signal);
          if (ac.signal.aborted) return;
          bankCacheRef.current.set(code, hit);
        }
        if (hit) {
          await s.applyScope({ mode: "company", companyId: Number(c.id) });
          if (!ac.signal.aborted) setBankReady(true);
          return;
        }
      }
      if (!ac.signal.aborted) {
        setBankReady(false);
        setListError(i18n.bankUnauthorizedCompany);
      }
    })().catch((e) => {
      if (e?.name !== "AbortError") setListError(e?.message || i18n.loadFailed);
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.me, s.loading, s.companies]);

  const loadList = useCallback(
    async (signal) => {
      if (!scopeReady || scope?.mode !== "company" || !scope.companyId) {
        setListError(i18n.bankNeedCompany);
        setRows([]);
        return;
      }
      const seq = ++seqRef.current;
      setListLoading(true);
      setListError("");
      try {
        const data = await fetchBankProcessList(scope.companyId, { signal });
        if (seq !== seqRef.current) return;
        setRows(data.rows);
        setCurrencyCodes(data.currencyCodes);
        setCurrency((prev) => (prev && data.currencyCodes.includes(prev) ? prev : ""));
        setBankReady(true);
      } catch (e) {
        if (e?.name === "AbortError" || seq !== seqRef.current) return;
        const msg = String(e?.message || "");
        if (/unauthorized permission category/i.test(msg)) {
          setListError(i18n.bankUnauthorizedCompany);
          setBankReady(false);
        } else {
          setListError(msg || i18n.loadFailed);
        }
        setRows([]);
      } finally {
        if (seq === seqRef.current) setListLoading(false);
      }
    },
    [scope, scopeReady, i18n.bankNeedCompany, i18n.bankUnauthorizedCompany, i18n.loadFailed],
  );

  useEffect(() => {
    if (!s.me || !scopeReady || !bankReady) return undefined;
    const ac = new AbortController();
    loadList(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.me, scopeCacheKey, bankReady]);

  const displayRows = useMemo(() => {
    let list = filterBankProcessRowsBySearch(rows, query);
    list = list.filter((r) => matchesBankProcessStatusFilters(r, statusFilters));
    list = filterBankProcessRowsByDate(list, dateFrom, dateTo);
    if (currency) {
      const code = currency.toUpperCase();
      list = list.filter((r) => String(r.country || "").trim().toUpperCase() === code);
    }
    return list;
  }, [rows, query, statusFilters, dateFrom, dateTo, currency]);

  const { visible, hasMore, sentinelRef, shown, total } = useIncrementalList(displayRows);

  const scopeLabel = s.groupMode
    ? s.selectedGroup || i18n.group
    : String(s.selectedCompany?.company_id || "").toUpperCase() || i18n.company;

  const stickyBar = (
    <div className="m-mt-sticky">
      <MaintenanceFilterBar
        i18n={i18n}
        dateFrom={dateFrom}
        dateTo={dateTo}
        groupMode={s.groupMode}
        selectedGroup={s.selectedGroup}
        selectedCompany={s.selectedCompany}
        onOpen={() => setFilterOpen(true)}
      />
      <div className="m-mt-search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={i18n.bankSearchPlaceholder}
          inputMode="search"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label={i18n.reset}>
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (s.blocked) return null;

  return (
    <MobileShell
      i18n={i18n}
      me={s.me}
      companyCode={scopeLabel}
      onLogout={s.logout}
      onRefresh={() => loadList()}
      refreshing={listLoading}
      stickyBar={stickyBar}
      lang={s.lang}
      onLangChange={s.setLang}
      overlayOpen={filterOpen}
      overlay={
        <MaintenanceFilterSheet
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          i18n={i18n}
          dateFrom={dateFrom}
          dateTo={dateTo}
          activePreset={activePreset}
          groupMode={s.groupMode}
          selectedGroup={s.selectedGroup}
          companyId={s.companyId}
          companies={s.companies}
          groupIds={s.groupIds}
          allowedGroupIds={s.allowedGroupIds}
          currencies={currencyCodes}
          currency={currency}
          statusFilters={statusFilters}
          withBankStatus
          readOnlyNote
          readOnlyNoteText={i18n.bankReadOnlyNote}
          onApply={async (next) => {
            const nextScope = next.scope;
            const scopeChanged =
              nextScope.mode !== scope?.mode ||
              String(nextScope.groupId ?? "") !== String(scope?.groupId ?? "") ||
              Number(nextScope.companyId ?? 0) !== Number(scope?.companyId ?? 0);
            if (scopeChanged) {
              if (nextScope.mode === "group") {
                setListError(i18n.bankNeedCompany);
                setBankReady(false);
                setRows([]);
              }
              const ok = await s.applyScope(
                nextScope.mode === "group"
                  ? { mode: "group", groupId: nextScope.groupId }
                  : { mode: "company", companyId: nextScope.companyId },
              );
              if (ok && nextScope.mode === "company") {
                const row = s.companies.find((c) => Number(c.id) === Number(nextScope.companyId));
                const code = String(row?.company_id || "").trim();
                if (code) {
                  const hasBank = await companyHasBankPermission(code);
                  bankCacheRef.current.set(code, hasBank);
                  setBankReady(hasBank);
                  if (!hasBank) {
                    setListError(i18n.bankUnauthorizedCompany);
                    setRows([]);
                  }
                } else {
                  setBankReady(true);
                }
              }
            }
            setDateFrom(next.dateFrom);
            setDateTo(next.dateTo);
            setActivePreset(next.activePreset);
            setCurrency(next.currency ?? "");
            if (next.statusFilters) setStatusFilters({ ...DEFAULT_STATUS, ...next.statusFilters });
          }}
        />
      }
    >
      <div className="m-mt-content">
        {s.toast ? (
          <div className={`m-mt-toast${s.toast.tone === "error" ? " is-error" : ""}`}>
            {s.toast.message}
          </div>
        ) : null}
        {listError ? <div className="m-mt-error">{listError}</div> : null}

        {listLoading && displayRows.length === 0 ? (
          <div className="m-mt-state">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            <p>{i18n.loading}</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="m-mt-state">
            <i className="fas fa-inbox" aria-hidden="true" />
            <p>{i18n.noData}</p>
          </div>
        ) : (
          <>
            <div className="m-mt-list">
              {visible.map((row, idx) => (
                <BankProcessCard key={rowKey(row, idx)} row={row} i18n={i18n} />
              ))}
            </div>
            {hasMore ? (
              <div ref={sentinelRef} className="m-mt-more">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                <span>
                  {shown} / {total}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </MobileShell>
  );
}

function BankProcessCard({ row, i18n }) {
  const status = bankProcessDisplayStatus(row);
  const supplier = String(row.card_lower || row.supplier || "").trim() || "—";
  const owner = String(row.supplier || row.card_owner || "").trim() || "—";
  const meta = [
    String(row.country || "").trim().toUpperCase() || "—",
    String(row.contract || "").trim() || "—",
    String(row.date || row.day_start || "").slice(0, 10) || "—",
  ].join(" · ");

  return (
    <article className="m-mt-card m-bp-card">
      <div className="m-bp-card-top">
        <div className="m-bp-card-key">
          {supplier} · {bankTypeLabel(row)}
        </div>
        <span className={`m-bp-status ${statusToneClass(status)}`}>{status}</span>
      </div>
      <div className="m-bp-card-title">{owner}</div>
      <div className="m-bp-card-meta">{meta}</div>
      <div className="m-bp-amounts">
        <div className="m-bp-amt">
          <span>{i18n.bankCost}</span>
          <strong>{formatBankMoney(row.cost ?? row.buy_price)}</strong>
        </div>
        <div className="m-bp-amt">
          <span>{i18n.bankPrice}</span>
          <strong>{formatBankMoney(row.price ?? row.sell_price)}</strong>
        </div>
        <div className="m-bp-amt">
          <span>{i18n.bankProfit}</span>
          <strong className="is-profit">{formatBankMoney(row.profit)}</strong>
        </div>
      </div>
    </article>
  );
}
