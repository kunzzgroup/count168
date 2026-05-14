import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { applySharedGroupClickWithCompanySwitch } from "../../utils/sharedCompanyFilter.js";
import { buildApiUrl } from "../../utils/apiUrl.js";
import "../../../public/css/accountCSS.css";
import "../../../public/css/transaction.css";
import "../../../public/css/domain_report.css";
import "../../../public/css/date-range-picker.css";
import {
  fetchDomainReport,
  fetchProcesses,
  fetchCurrencies,
  fetchCompanyPermissions,
  isBankOnlyCategoryCompany
} from "./domainReportLogic.js";
import { formatYmd, quickRangeToDates } from "../../utils/dateUtils.js";
import { getReportText } from "../../translateFile/reportTranslate.js";

// Components
import DomainReportFilters from "./components/DomainReportFilters.jsx";
import DomainReportTable from "./components/DomainReportTable.jsx";

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
  const [selectedGroup, setSelectedGroup] = useState(null);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // -- State: UI --
  const [toast, setToast] = useState(null);
  const [cssReady, setCssReady] = useState(false);
  const toastTimerRef = useRef(null);

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
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        setCompanyId(effective);
        if (effective) await checkBankOnly(effective);

        const cur = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && cur?.group_id && String(cur.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && cur?.group_id?.trim()) {
          selGroup = String(cur.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }
        setSelectedGroup(selGroup);
        if (selGroup) sessionStorage.setItem("dashboard_group_filter", selGroup);

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
      const data = await fetchDomainReport({
        processId,
        dateFrom,
        dateTo,
        companyId,
        selectedCurrencies,
        showAllCurrencies,
      });
      setReportData(data);
    } catch (err) {
      setError(err.message);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, processId, dateFrom, dateTo, selectedCurrencies, showAllCurrencies]);

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
      }, 300);
      return () => clearTimeout(handler);
    }
  }, [bootLoading, companyId, processId, dateFrom, dateTo, selectedCurrencies, showAllCurrencies, loadReport]);

  // -- Handlers --
  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) { notify(json.error || t("switchFailed"), "danger"); return; }
      setCompanyId(Number(c.id));
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      await checkBankOnly(c.id);
      notifyCompanySessionUpdated();
    } catch { notify(t("switchFailed"), "danger"); }
  };

  const onGroupClick = async (gid) => {
    await applySharedGroupClickWithCompanySwitch({
      clickedGroupId: gid,
      currentSelectedGroup: selectedGroup,
      companies,
      currentCompanyId: companyId,
      setSelectedGroup,
      switchCompany: onSwitchCompany,
    });
  };

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
          onSwitchCompany={onSwitchCompany}
          companies={companies}
          selectedGroup={selectedGroup}
          onGroupClick={onGroupClick}
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
          quickRangeToDates={quickRangeToDates}
          t={t}
        />

        <DomainReportTable
          reportData={reportData}
          loading={loading}
          error={error}
          t={t}
        />
      </div>

      {/* Notifications */}
      {toast && (
        <div id="domainReportNotificationContainer" className="account-notification-container">
          <div className={`account-notification account-notification-${toast.type} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
