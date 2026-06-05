import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  getCachedOwnerCompanies,
  DASHBOARD_GROUP_FILTER_KEY,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  readPersistedDashboardGcFilter,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
  fetchOwnerCompaniesAll,
} from "../../../utils/company/sharedCompanyFilter.js";
import { isGroupLogin } from "../../../utils/company/loginScope.js";
import { useReportGroupCompanyFilter } from "../shared/useReportGroupCompanyFilter.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/domain_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/maintenance_notifications.css";
import { fetchDomainReport, fetchProcesses } from "./domainReportApi.js";
import {
  isDomainGroupProcessSelection,
  mapDomainGroupProcesses,
} from "./domainReportGroupProcesses.js";
import {
  fetchCompanyPermissions,
  fetchReportScopeCurrencies,
  isBankOnlyCategoryCompany,
} from "../shared/reportCompanyApi.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { getReportText, REPORT_I18N } from "../../../translateFile/pages/reportTranslate.js";
import DomainReportFilters from "./DomainReportFilters.jsx";
import DomainReportTable from "./DomainReportTable.jsx";
import { reportToastMaintenanceVariant } from "../shared/reportAmountFormat.js";
import {
  buildReportSnapshotKey,
  getReportSnapshot,
  setReportSnapshot,
} from "../shared/reportPageSnapshotCache.js";
import { useReportAbortSeq } from "../shared/useReportAbortSeq.js";
import {
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
} from "../shared/reportScope.js";
import {
  domainReportScopeIsReady,
  domainReportUsesSalaryBonusProcesses,
  resolveDomainReportScope,
} from "./domainReportScope.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { syncCompanySessionInBackground } from "../../../utils/company/companySessionSwitchCore.js";

const REPORT_PAGE_KEY = "domain";
const REPORT_FETCH_DEBOUNCE_MS = 150;
function sameCodeList(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] || "").toUpperCase() !== String(b[i] || "").toUpperCase()) return false;
  }
  return true;
}

function resolveReportBootCompanyId() {
  const cached = getCachedOwnerCompanies();
  const url = new URL(window.location.href);
  const queryCompany = url.searchParams.get("company_id");
  return resolveBootCompanyId({
    urlCompanyId: queryCompany,
    defaultRowId: cached?.[0]?.id,
  });
}

export default function DomainReportPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getReportText(lang, key, params), [lang]);
  const r = useMemo(() => REPORT_I18N[lang] || REPORT_I18N.en, [lang]);

  const [companies, setCompanies] = useState(() => getCachedOwnerCompanies() || []);

  const [companyId, setCompanyId] = useState(resolveReportBootCompanyId);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    const g = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
    return g ? String(g).trim().toUpperCase() : null;
  });
  const companySessionAbortRef = useRef(null);
  const [processId, setProcessId] = useState("");
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  /** Avoid report fetch before currency filter is resolved (prevents double load on entry). */
  const [currencyFilterReady, setCurrencyFilterReady] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  const [processes, setProcesses] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const reportDataRef = useRef(null);
  const [reportSyncing, setReportSyncing] = useState(false);
  const [error, setError] = useState("");

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const { begin: beginReportFetch, invalidate: invalidateReportFetch, isCurrent: isReportFetchCurrent } =
    useReportAbortSeq();
  const { begin: beginMetaFetch, invalidate: invalidateMetaFetch, isCurrent: isMetaFetchCurrent } =
    useReportAbortSeq();
  const pageBootOnceRef = useRef(false);
  const prevCompanyIdRef = useRef(null);
  const prevScopeKeyRef = useRef(null);
  const prevScopeModeRef = useRef(null);
  /** Per-company / per-group currency filter prefs */
  const currencyPrefsByCompanyRef = useRef({});
  const selectedCurrenciesRef = useRef(selectedCurrencies);
  const showAllCurrenciesRef = useRef(showAllCurrencies);

  useEffect(() => {
    selectedCurrenciesRef.current = selectedCurrencies;
  }, [selectedCurrencies]);

  useEffect(() => {
    showAllCurrenciesRef.current = showAllCurrencies;
  }, [showAllCurrencies]);

  useEffect(() => {
    reportDataRef.current = reportData;
  }, [reportData]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];
    for (const href of links) {
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }

    return () => {
      document.body.classList.remove("report-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!me || companyId != null) return;
    const cached = getCachedOwnerCompanies();
    const url = new URL(window.location.href);
    const queryCompany = url.searchParams.get("company_id");
    const effective = resolveBootCompanyId({
      urlCompanyId: queryCompany,
      sessionCompanyId: me.company_id,
      defaultRowId: cached?.[0]?.id,
    });
    if (isDashboardGroupOnlyMode()) return;
    if (effective != null) setCompanyId(effective);
  }, [me, companyId]);

  useEffect(() => {
    if (!sessionReady || !me) return;
    if (pageBootOnceRef.current) return;
    pageBootOnceRef.current = true;

    const u = me;
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const hasFull = perms.length === 0;
    const canReport = hasFull || perms.includes("report");
    if (!canReport || !u.company_has_gambling) {
      navigate("/dashboard", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchOwnerCompaniesAll();
        if (cancelled) return;
        setCompanies(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const persisted = readPersistedDashboardGcFilter();
        let effective = resolveBootCompanyId({
          urlCompanyId: queryCompany,
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });
        if (persisted.groupOnly || (isGroupLogin(u) && !queryCompany)) {
          effective = null;
          persistDashboardGroupOnlyMode(true);
        }
        const bootGroupOnly = persisted.groupOnly || (isGroupLogin(u) && effective == null);
        const nextCompanyId =
          companyId != null ? companyId : bootGroupOnly ? null : effective;
        const row =
          nextCompanyId != null
            ? rows.find((c) => Number(c.id) === Number(nextCompanyId)) || null
            : null;
        setCompanyId((prev) => (prev != null ? prev : nextCompanyId));
        setSelectedGroup(resolveInitialSelectedGroupFromSession(rows, row));
        if (nextCompanyId != null) void checkBankOnly(nextCompanyId);
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate, companyId]);

  useEffect(() => {
    if (!companies.length) return;
    const row =
      companyId != null
        ? companies.find((c) => Number(c.id) === Number(companyId)) || null
        : null;
    setSelectedGroup((prev) => {
      const resolved = resolveInitialSelectedGroupFromSession(companies, row);
      if (resolved) return resolved;
      const g = prev ? String(prev).trim().toUpperCase() : "";
      if (g && sortedUniqueGroupIds(companies).includes(g)) return g;
      return prev;
    });
  }, [companies, companyId]);

  const checkBankOnly = useCallback(async (compId) => {
    if (!compId) return;
    try {
      const comp = companies.find(c => Number(c.id) === Number(compId));
      const perms = await fetchCompanyPermissions(comp?.company_id || "");
      if (isBankOnlyCategoryCompany(perms)) {
        window.location.assign(new URL("/process-list", window.location.origin).href);
      }
    } catch (err) {
      console.error("Bank only check error:", err);
    }
  }, [companies]);

  const handleClearCompany = useCallback(
    (groupForScope) => {
      const groupKey = String(groupForScope || selectedGroup || "")
        .trim()
        .toUpperCase();
      persistDashboardFilterState(groupKey || null, null);
      invalidateReportFetch();
      flushSync(() => setCompanyId(null));
      setError("");
      setProcessId("");
      if (reportDataRef.current != null) setReportSyncing(true);
      setCurrencyFilterReady(false);
    },
    [invalidateReportFetch, selectedGroup],
  );

  const onPrepareCompanySelect = useCallback((c) => {
    const nextId = Number(c?.id);
    if (!nextId) return;
    persistDashboardGroupOnlyMode(false);
    flushSync(() => setCompanyId(nextId));
    if (reportDataRef.current != null) setReportSyncing(true);
    startTransition(() => {
      setProcessId("");
      setCurrencyFilterReady(false);
    });
  }, []);

  const onSwitchCompany = useCallback(
    async (c) => {
      if (!c?.id) return;
      const nextId = Number(c.id);
      const previousCompanyId = companyId;
      void checkBankOnly(nextId);

      companySessionAbortRef.current?.abort();
      const ac = new AbortController();
      companySessionAbortRef.current = ac;

      const ok = await syncCompanySessionInBackground({
        companyId: nextId,
        sessionCompanyId: me?.company_id,
        signal: ac.signal,
        layoutSilent: true,
        onFailure: () => {
          if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
            flushSync(() => setCompanyId(previousCompanyId));
          }
          setReportSyncing(false);
          notify(t("switchFailed"), "danger");
        },
      });
      if (!ok) return;
    },
    [checkBankOnly, companyId, me?.company_id, notify, t],
  );

  const {
    groupIds,
    companiesForPicker: companyButtons,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup,
    handlePickCompany,
    allowClearCompany,
  } = useReportGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onPrepareCompanySelect,
    onSelectCompany: onSwitchCompany,
    onClearCompany: handleClearCompany,
    switchingCompany: false,
    preferredCompanyId: companyId,
  });

  const reportScope = useMemo(
    () =>
      resolveDomainReportScope({
        companies,
        selectedGroup,
        companyId,
        groupsAllMode,
        groupAllMode,
      }),
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode],
  );

  const isGroupScope = domainReportUsesSalaryBonusProcesses(reportScope);

  const reportParams = useMemo(
    () => ({
      processId,
      dateFrom,
      dateTo,
      reportScope,
      selectedCurrencies,
      showAllCurrencies,
      scopeKey: customerReportScopeCacheKey(reportScope),
    }),
    [processId, dateFrom, dateTo, reportScope, selectedCurrencies, showAllCurrencies],
  );

  const loadReport = useCallback(async () => {
    if (!domainReportScopeIsReady(reportScope) || !dateFrom || !dateTo) return;
    const { signal, seq } = beginReportFetch();
    const quietRefresh = reportDataRef.current != null;
    if (quietRefresh) setReportSyncing(true);
    setError("");
    try {
      const data = await fetchDomainReport(reportParams, { signal });
      if (!isReportFetchCurrent(seq)) return;
      startTransition(() => {
        setReportData(data);
      });
      setReportSnapshot(REPORT_PAGE_KEY, buildReportSnapshotKey(reportParams), data);
      if (!data?.data?.length) {
        notify(t("noDataAdjustSearch"), "info");
      }
    } catch (err) {
      if (err?.name === "AbortError" || !isReportFetchCurrent(seq)) return;
      const msg = err.message || t("loadReportFailed");
      setError(msg);
      notify(msg, "error");
      startTransition(() => {
        setReportData(null);
      });
    } finally {
      if (isReportFetchCurrent(seq)) {
        setReportSyncing(false);
      }
    }
  }, [reportScope, dateFrom, dateTo, reportParams, beginReportFetch, isReportFetchCurrent, t, notify]);

  const persistCurrencyPrefs = useCallback((scope, currencies, showAll) => {
    const key = customerReportScopeCacheCompanyKey(scope);
    if (key == null) return;
    currencyPrefsByCompanyRef.current[key] = {
      selectedCurrencies: currencies,
      showAllCurrencies: showAll,
    };
  }, []);

  const applySavedCurrencyPrefs = useCallback((scope, curs) => {
    const key = customerReportScopeCacheCompanyKey(scope);
    const saved = key != null ? currencyPrefsByCompanyRef.current[key] : null;
    if (!saved) return false;
    if (saved.showAllCurrencies) {
      setShowAllCurrencies(true);
      setSelectedCurrencies([]);
      return true;
    }
    if (saved.selectedCurrencies?.length > 0) {
      const valid = saved.selectedCurrencies.filter((code) =>
        curs.some((c) => c.code === code),
      );
      if (valid.length > 0) {
        setSelectedCurrencies(valid);
        setShowAllCurrencies(false);
        return true;
      }
    }
    return false;
  }, []);

  const loadMetaData = useCallback(async () => {
    if (!domainReportScopeIsReady(reportScope)) return;
    const { signal, seq } = beginMetaFetch();
    try {
      const curs = await fetchReportScopeCurrencies(reportScope, { signal });
      if (!isMetaFetchCurrent(seq)) return;
      const procsRaw = await fetchProcesses(reportScope, { signal });
      if (!isMetaFetchCurrent(seq)) return;
      const procs = isGroupScope ? mapDomainGroupProcesses(procsRaw) : procsRaw;
      setProcesses(procs);
      if (isGroupScope && !isDomainGroupProcessSelection(processId, procs)) {
        setProcessId("");
      }
      setCurrencyList(curs);

      const scopeModeChanged =
        prevScopeModeRef.current != null && prevScopeModeRef.current !== reportScope?.mode;
      prevScopeModeRef.current = reportScope?.mode ?? null;

      if (!scopeModeChanged && applySavedCurrencyPrefs(reportScope, curs)) return;

      if (!scopeModeChanged && showAllCurrenciesRef.current) {
        setShowAllCurrencies(true);
        setSelectedCurrencies([]);
        persistCurrencyPrefs(reportScope, [], true);
        return;
      }

      const validCurrent = scopeModeChanged
        ? []
        : selectedCurrenciesRef.current.filter((code) =>
            curs.some((c) => c.code === code),
          );
      if (validCurrent.length > 0) {
        setShowAllCurrencies(false);
        setSelectedCurrencies((prev) => (sameCodeList(prev, validCurrent) ? prev : validCurrent));
        persistCurrencyPrefs(reportScope, validCurrent, false);
        return;
      }

      if (curs.length > 0) {
        const myr = curs.find((c) => c.code === "MYR");
        const def = myr || curs[0];
        const codes = [def.code];
        setSelectedCurrencies(codes);
        setShowAllCurrencies(false);
        persistCurrencyPrefs(reportScope, codes, false);
      }
    } catch (err) {
      if (err?.name === "AbortError" || !isMetaFetchCurrent(seq)) return;
      console.error("Meta data load error:", err);
    } finally {
      if (isMetaFetchCurrent(seq)) {
        setCurrencyFilterReady(true);
      }
    }
  }, [
    reportScope,
    isGroupScope,
    processId,
    applySavedCurrencyPrefs,
    persistCurrencyPrefs,
    beginMetaFetch,
    isMetaFetchCurrent,
  ]);

  useEffect(() => {
    if (!companyId) return;
    const prev = prevCompanyIdRef.current;
    if (prev != null && Number(prev) !== Number(companyId)) {
      invalidateReportFetch();
      setReportSyncing(false);
      const prevScope = resolveDomainReportScope({
        companies,
        selectedGroup,
        companyId: prev,
      });
      persistCurrencyPrefs(
        prevScope,
        selectedCurrenciesRef.current,
        showAllCurrenciesRef.current,
      );
      const savedKey = customerReportScopeCacheCompanyKey(
        resolveDomainReportScope({ companies, selectedGroup, companyId }),
      );
      const saved = savedKey != null ? currencyPrefsByCompanyRef.current[savedKey] : null;
      if (saved?.showAllCurrencies) {
        setShowAllCurrencies(true);
        setSelectedCurrencies([]);
      } else if (saved?.selectedCurrencies?.length) {
        setSelectedCurrencies([...saved.selectedCurrencies]);
        setShowAllCurrencies(false);
      } else {
        setSelectedCurrencies([]);
        setShowAllCurrencies(false);
      }
      setCurrencyFilterReady(false);
      setProcessId("");
      if (reportDataRef.current != null) setReportSyncing(true);
    }
    prevCompanyIdRef.current = companyId;
  }, [companyId, companies, selectedGroup, persistCurrencyPrefs, invalidateReportFetch]);

  useEffect(() => {
    if (!currencyFilterReady) {
      invalidateReportFetch();
      setReportSyncing(false);
    }
  }, [currencyFilterReady, invalidateReportFetch]);

  useEffect(() => {
    if (!domainReportScopeIsReady(reportScope)) {
      setCurrencyFilterReady(false);
      return;
    }
    setCurrencyList([]);
    setCurrencyFilterReady(false);
    loadMetaData();
  }, [reportScope, loadMetaData]);

  useEffect(() => {
    const scopeKey = customerReportScopeCacheKey(reportScope);
    const prev = prevScopeKeyRef.current;
    if (prev != null && prev !== scopeKey) {
      invalidateReportFetch();
      setError("");
      setProcessId("");
    }
    prevScopeKeyRef.current = scopeKey || null;
  }, [reportScope, invalidateReportFetch]);

  useEffect(() => {
    if (!domainReportScopeIsReady(reportScope) || !currencyFilterReady) return undefined;
    const handler = window.setTimeout(() => {
      loadReport();
    }, REPORT_FETCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handler);
      invalidateReportFetch();
    };
  }, [reportScope, currencyFilterReady, loadReport, invalidateReportFetch]);

  useEffect(() => {
    if (!domainReportScopeIsReady(reportScope) || !currencyFilterReady) return;
    const key = buildReportSnapshotKey(reportParams);
    const snap = getReportSnapshot(REPORT_PAGE_KEY);
    if (snap?.key === key && snap.data && reportDataRef.current == null) {
      reportDataRef.current = snap.data;
      startTransition(() => {
        setReportData(snap.data);
      });
    }
  }, [reportScope, currencyFilterReady, reportParams]);

  const toggleCurrency = (code) => {
    setShowAllCurrencies(false);
    setSelectedCurrencies((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      persistCurrencyPrefs(reportScope, next, false);
      return next;
    });
  };

  const toggleAllCurrencies = () => {
    const nextAll = !showAllCurrencies;
    setShowAllCurrencies(nextAll);
    if (nextAll) {
      setSelectedCurrencies([]);
      persistCurrencyPrefs(reportScope, [], true);
    } else {
      persistCurrencyPrefs(reportScope, selectedCurrenciesRef.current, false);
    }
  };

  return (
    <div className="container">
      <div className="content">
        <DomainReportFilters
          companyId={companyId}
          highlightCompanyId={companyId}
          onSwitchCompany={handlePickCompany}
          onClearCompany={handleClearCompany}
          allowClearCompany={allowClearCompany}
          groupIds={groupIds}
          selectedGroup={selectedGroup}
          onPickGroup={handlePickGroup}
          onPickAllGroups={handlePickAllGroups}
          onPickAllInGroup={handlePickAllInGroup}
          groupsAllMode={groupsAllMode}
          groupAllMode={groupAllMode}
          companyButtons={companyButtons}
          processId={processId}
          setProcessId={setProcessId}
          processes={processes}
          isGroupScope={isGroupScope}
          currencyList={currencyList}
          selectedCurrencies={selectedCurrencies}
          toggleCurrency={toggleCurrency}
          showAllCurrencies={showAllCurrencies}
          toggleAllCurrencies={toggleAllCurrencies}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
          t={t}
          monthLabels={r.monthsShort}
          weekdaysShort={r.weekdaysShort}
        />

        <div className="domain-report-table-region">
          {reportSyncing && reportData != null && (
            <div className="domain-report-sync-track" aria-hidden>
              <div className="domain-report-sync-bar" />
            </div>
          )}
          <DomainReportTable
            reportData={reportData}
            reportSyncing={reportSyncing}
            error={error}
            t={t}
          />
        </div>
      </div>

      {toast && (
        <div id="domainReportNotificationContainer" className="maintenance-notification-container">
          <div className={`maintenance-notification maintenance-notification-${reportToastMaintenanceVariant(toast.type)} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
