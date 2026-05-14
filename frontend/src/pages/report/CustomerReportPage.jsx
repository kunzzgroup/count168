import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { normalizeOwnerCompanyRow, persistDashboardGroupFilter } from "../../utils/sharedCompanyFilter.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import "../../../public/css/accountCSS.css";
import "../../../public/css/transaction.css";
import "../../../public/css/userlist.css";
import "../../../public/css/customer_report.css";
import "../../../public/css/date-range-picker.css";
import {
  fetchAccounts,
  fetchCurrencies,
  fetchCustomerReport,
  fetchCompanyPermissions,
  isBankOnlyCategoryCompany,
} from "./customerReportLogic.js";
import { formatYmd, quickRangeToDates } from "../../utils/dateUtils.js";
import { getReportText } from "../../translateFile/reportTranslate.js";

// Components
import CustomerReportFilters from "./components/CustomerReportFilters.jsx";
import CustomerReportTable from "./components/CustomerReportTable.jsx";
import { useReportGcSwitcher } from "./hooks/useReportGcSwitcher.js";

export default function CustomerReportPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getReportText(lang, key, params), [lang]);

  // -- State: Boot / Me --
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);

  // -- State: Filters --
  const [companyId, setCompanyId] = useState(null);
  /** Process List 同款：all | follow | ungrouped */
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);

  // Date Range
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  // -- State: Data --
  const [accounts, setAccounts] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // -- State: UI --
  const [toast, setToast] = useState(null);
  const [cssReady, setCssReady] = useState(false);
  const toastTimerRef = useRef(null);

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
    setLoading(true);
    setError("");
    try {
      const data = await fetchCustomerReport({
        accountId,
        dateFrom,
        dateTo,
        showAll,
        companyId,
        selectedCurrencies,
        showAllCurrencies
      });
      setReportData(data);
    } catch (err) {
      setError(err.message);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, accountId, dateFrom, dateTo, showAll, selectedCurrencies, showAllCurrencies]);

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
      const [accs, curs] = await Promise.all([
        fetchAccounts(companyId),
        fetchCurrencies(companyId)
      ]);
      setAccounts(accs);
      setCurrencyList(curs);

      if (curs.length > 0 && selectedCurrencies.length === 0 && !showAllCurrencies) {
        const myr = curs.find(c => c.code === "MYR");
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
      }, 300);
      return () => clearTimeout(handler);
    }
  }, [bootLoading, companyId, accountId, dateFrom, dateTo, showAll, selectedCurrencies, showAllCurrencies, loadReport]);

  // -- Handlers --
  const onSwitchCompany = useCallback(async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    setSwitchingCompany(true);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) { notify(json.error || t("switchFailed"), "danger"); return; }
      setCompanyId(Number(c.id));
      setGroupFilterKind((prev) => (prev === "all" || prev === "ungrouped" ? prev : "follow"));
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      persistDashboardGroupFilter(newGroup || null);

      await checkBankOnly(c.id);
      notifyCompanySessionUpdated();
    } catch { notify(t("switchFailed"), "danger"); }
    finally { setSwitchingCompany(false); }
  }, [companyId, notify, t, checkBankOnly]);

  const handlePickGroup = useCallback(
    (gid) => {
      if (switchingCompany) return;
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
    [allCompanyButtons, groupFilterKind, onSwitchCompany, selectedGroupKey, switchingCompany],
  );

  const handlePickAllGroups = useCallback(() => {
    if (switchingCompany) return;
    setGroupFilterKind((k) => (k === "all" ? "ungrouped" : "all"));
  }, [switchingCompany]);

  const toggleCurrency = (code) => {
    setShowAllCurrencies(false);
    setSelectedCurrencies(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      return [...prev, code];
    });
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
          <h1 className="account-page-title">{t("customerReportTitle")}</h1>
        </div>

        <CustomerReportFilters
          companyId={companyId}
          onSwitchCompany={onSwitchCompany}
          groupIds={groupIds}
          groupFilterKind={groupFilterKind}
          selectedGroupKey={selectedGroupKey}
          onPickAllGroups={handlePickAllGroups}
          onPickGroup={handlePickGroup}
          companyButtons={companyButtons}
          switchingCompany={switchingCompany}
          accountId={accountId}
          setAccountId={setAccountId}
          accounts={accounts}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
          quickRangeToDates={quickRangeToDates}
          showAll={showAll}
          setShowAll={setShowAll}
          currencyList={currencyList}
          selectedCurrencies={selectedCurrencies}
          toggleCurrency={toggleCurrency}
          showAllCurrencies={showAllCurrencies}
          toggleAllCurrencies={toggleAllCurrencies}
          t={t}
        />

        <CustomerReportTable
          reportData={reportData}
          loading={loading}
          error={error}
          currencyList={currencyList}
          t={t}
        />
      </div>

      {/* Notifications */}
      {toast && (
        <div id="customerReportNotificationContainer" className="account-notification-container">
          <div className={`account-notification account-notification-${toast.type} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
