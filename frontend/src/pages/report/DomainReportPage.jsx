import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { normalizeOwnerCompanyRow, persistDashboardGroupFilter } from "../../utils/sharedCompanyFilter.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import "../../../public/css/accountCSS.css";
import "../../../public/css/transaction.css";
import "../../../public/css/userlist.css";
import "../../../public/css/domain_report.css";
import "../../../public/css/report-outlined-fields.css";
import "../../../public/css/date-range-picker.css";
import "../../../public/css/maintenance_notifications.css";
import {
  fetchDomainReport,
  fetchProcesses,
  fetchCurrencies,
  fetchCompanyPermissions,
  isBankOnlyCategoryCompany
} from "./domainReportLogic.js";
import { formatYmd } from "../../utils/dateUtils.js";
import { getReportText } from "../../translateFile/reportTranslate.js";

// Components
import DomainReportFilters from "./components/DomainReportFilters.jsx";
import DomainReportTable from "./components/DomainReportTable.jsx";
import { useReportGcSwitcher } from "./hooks/useReportGcSwitcher.js";
import { reportToastMaintenanceVariant } from "./reportToastVariant.js";

export default function DomainReportPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getReportText(lang, key, params), [lang]);

  // -- State: Boot / Me --
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);

  // -- State: Filters --
  const [companyId, setCompanyId] = useState(null);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [companyHighlightId, setCompanyHighlightId] = useState(null);
  const switchCompanySeqRef = useRef(0);
  const [processId, setProcessId] = useState("");
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);

  // Date Range
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  // -- State: Data --
  const [processes, setProcesses] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const reportDataRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [reportSyncing, setReportSyncing] = useState(false);
  const [error, setError] = useState("");

  // -- State: UI --
  const [toast, setToast] = useState(null);
  const [cssReady, setCssReady] = useState(false);
  const toastTimerRef = useRef(null);
  const domainReportSeqRef = useRef(0);
  const domainReportAbortRef = useRef(null);

  useEffect(() => {
    reportDataRef.current = reportData;
  }, [reportData]);

  const { allCompanyButtons, groupIds, selectedGroupKey, companyButtons } = useReportGcSwitcher(
    companies,
    companyId,
    groupFilterKind,
  );

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

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");

    let cancelled = false;
    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];

    const waitForStylesheet = (href) =>
      new Promise((resolve) => {
        const markLoaded = (el) => {
          try { el.dataset.loaded = "1"; } catch { /* ignore */ }
          resolve(el);
        };
        const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
        if (existing) {
          if (existing.dataset.loaded === "1" || existing.sheet) return resolve(existing);
          const onLoad = () => { existing.removeEventListener("load", onLoad); existing.removeEventListener("error", onError); markLoaded(existing); };
          const onError = () => { existing.removeEventListener("load", onLoad); existing.removeEventListener("error", onError); resolve(existing); };
          existing.addEventListener("load", onLoad, { once: true });
          existing.addEventListener("error", onError, { once: true });
          return;
        }
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        l.onload = () => markLoaded(l);
        l.onerror = () => resolve(l);
        document.head.appendChild(l);
      });

    Promise.all(links.map(waitForStylesheet)).then(() => {
      if (!cancelled) setCssReady(true);
    });

    return () => {
      cancelled = true;
      document.body.classList.remove("report-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // -- Boot Logic --
  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }

        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canReport = hasFull || perms.includes("report");
        if (!canReport || !u.company_has_gambling) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);

        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data.map(normalizeOwnerCompanyRow) : [];
        setCompanies(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        setCompanyId(effective);
        setGroupFilterKind("follow");
        if (effective) await checkBankOnly(effective);

      } catch {
        navigate("/login", { replace: true });
      } finally {
        setBootLoading(false);
      }
    })();
  }, [navigate]);

  // -- Data Fetching --
  const loadReport = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return;
    domainReportAbortRef.current?.abort();
    const ac = new AbortController();
    domainReportAbortRef.current = ac;
    const seq = ++domainReportSeqRef.current;
    const quietRefresh = reportDataRef.current != null;
    if (!quietRefresh) setLoading(true);
    if (quietRefresh) setReportSyncing(true);
    setError("");
    try {
      const data = await fetchDomainReport(
        {
          processId,
          dateFrom,
          dateTo,
          companyId,
          selectedCurrencies,
          showAllCurrencies,
        },
        { signal: ac.signal },
      );
      if (seq !== domainReportSeqRef.current) return;
      startTransition(() => {
        setReportData(data);
      });
      if (!data?.data?.length) {
        notify(t("noDataAdjustSearch"), "info");
      }
    } catch (err) {
      if (err?.name === "AbortError" || seq !== domainReportSeqRef.current) return;
      const msg = err.message || t("loadReportFailed");
      setError(msg);
      notify(msg, "error");
      startTransition(() => {
        setReportData(null);
      });
    } finally {
      if (seq === domainReportSeqRef.current) {
        setLoading(false);
        setReportSyncing(false);
      }
    }
  }, [companyId, processId, dateFrom, dateTo, selectedCurrencies, showAllCurrencies, t, notify]);

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

  const loadMetaData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [procs, curs] = await Promise.all([
        fetchProcesses(companyId),
        fetchCurrencies(companyId),
      ]);
      setProcesses(procs);
      setCurrencyList(curs);
      if (curs.length > 0 && selectedCurrencies.length === 0 && !showAllCurrencies) {
        const myr = curs.find((c) => c.code === "MYR");
        const def = myr || curs[0];
        setSelectedCurrencies([def.code]);
        setShowAllCurrencies(false);
      }
    } catch (err) {
      console.error("Meta data load error:", err);
    }
  }, [companyId, selectedCurrencies.length, showAllCurrencies]);

  useEffect(() => {
    if (!bootLoading && companyId) loadMetaData();
  }, [bootLoading, companyId, loadMetaData]);

  useEffect(() => {
    if (!bootLoading && companyId) {
      const handler = setTimeout(() => {
        loadReport();
      }, 0);
      return () => clearTimeout(handler);
    }
  }, [bootLoading, companyId, processId, dateFrom, dateTo, selectedCurrencies, showAllCurrencies, loadReport]);

  useEffect(() => () => {
    domainReportAbortRef.current?.abort();
  }, []);

  // -- Handlers --
  const onSwitchCompany = useCallback(async (c) => {
    const effectiveId = companyHighlightId ?? companyId;
    if (!c?.id || Number(c.id) === Number(effectiveId)) return;
    const reqId = ++switchCompanySeqRef.current;
    setCompanyHighlightId(Number(c.id));
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (reqId !== switchCompanySeqRef.current) return;
      if (!json.success) {
        setCompanyHighlightId(null);
        notify(json.error || t("switchFailed"), "danger");
        return;
      }
      setCompanyId(Number(c.id));
      setGroupFilterKind((prev) => (prev === "all" || prev === "ungrouped" ? prev : "follow"));
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      persistDashboardGroupFilter(newGroup || null);
      setCompanyHighlightId(null);
      void checkBankOnly(c.id);
      notifyCompanySessionUpdated();
    } catch {
      if (reqId === switchCompanySeqRef.current) setCompanyHighlightId(null);
      notify(t("switchFailed"), "danger");
    }
  }, [companyId, companyHighlightId, notify, t, checkBankOnly]);

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      if (groupFilterKind === "follow" && g === selectedGroupKey) {
        setGroupFilterKind("ungrouped");
        persistDashboardGroupFilter(null);
        return;
      }
      setGroupFilterKind("follow");
      persistDashboardGroupFilter(g);
      if (g === selectedGroupKey) return;
      const first = allCompanyButtons.find((row) => String(row.group_id || "").trim().toUpperCase() === g);
      if (first) void onSwitchCompany(first);
    },
    [allCompanyButtons, groupFilterKind, onSwitchCompany, selectedGroupKey],
  );

  const handlePickAllGroups = useCallback(() => {
    setGroupFilterKind((k) => (k === "all" ? "ungrouped" : "all"));
  }, []);

  const toggleCurrency = (code) => {
    setShowAllCurrencies(false);
    setSelectedCurrencies((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleAllCurrencies = () => {
    setShowAllCurrencies(!showAllCurrencies);
    if (!showAllCurrencies) setSelectedCurrencies([]);
  };

  if (bootLoading || !me || !cssReady) return null;

  return (
    <div className="container">
      <div className="content">
        <div className="report-header">
          <h1 className="account-page-title">{t("domainReportTitle")}</h1>
        </div>

        <DomainReportFilters
          companyId={companyId}
          highlightCompanyId={companyHighlightId}
          onSwitchCompany={onSwitchCompany}
          groupIds={groupIds}
          groupFilterKind={groupFilterKind}
          selectedGroupKey={selectedGroupKey}
          onPickAllGroups={handlePickAllGroups}
          onPickGroup={handlePickGroup}
          companyButtons={companyButtons}
          processId={processId}
          setProcessId={setProcessId}
          processes={processes}
          currencyList={currencyList}
          selectedCurrencies={selectedCurrencies}
          toggleCurrency={toggleCurrency}
          showAllCurrencies={showAllCurrencies}
          toggleAllCurrencies={toggleAllCurrencies}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
          t={t}
        />

        <div className="domain-report-table-region">
          {reportSyncing && (
            <div className="domain-report-sync-track" aria-hidden>
              <div className="domain-report-sync-bar" />
            </div>
          )}
          <DomainReportTable
            reportData={reportData}
            loading={loading}
            reportSyncing={reportSyncing}
            error={error}
            t={t}
          />
        </div>
      </div>

      {/* Notifications — same markup/classes as maintenance pages */}
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
