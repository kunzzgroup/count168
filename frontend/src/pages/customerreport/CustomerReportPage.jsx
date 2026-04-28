import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import {
  fetchAccounts,
  fetchCurrencies,
  fetchCustomerReport,
  formatYmd,
  quickRangeToDates,
} from "./customerReportLogic.js";

// Components
import CustomerReportFilters from "./components/CustomerReportFilters.jsx";
import CustomerReportTable from "./components/CustomerReportTable.jsx";

export default function CustomerReportPage() {
  const navigate = useNavigate();
  
  // -- State: Boot / Me --
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  
  // -- State: Filters --
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
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
  const toastTimerRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");

    // Inject fonts and legacy CSS
    const links = [
      "https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      assetUrl("css/accountCSS.css"),
      assetUrl("css/transaction.css"),
      assetUrl("css/customer_report.css"),
      assetUrl("css/global-13inch.css"),
    ];

    links.forEach(href => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        document.head.appendChild(l);
      }
    });

    return () => {
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

  const loadMetaData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [accs, curs] = await Promise.all([
        fetchAccounts(companyId),
        fetchCurrencies(companyId)
      ]);
      setAccounts(accs);
      setCurrencyList(curs);
      
      if (curs.length > 0) {
        const myr = curs.find(c => c.code === "MYR");
        const def = myr || curs[0];
        setSelectedCurrencies([def.code]);
        setShowAllCurrencies(false);
      }
    } catch (err) {
      console.error("Meta data load error:", err);
    }
  }, [companyId]);

  useEffect(() => {
    if (!bootLoading && companyId) loadMetaData();
  }, [bootLoading, companyId, loadMetaData]);

  useEffect(() => {
    if (!bootLoading && companyId) loadReport();
  }, [bootLoading, companyId, accountId, dateFrom, dateTo, showAll, selectedCurrencies, showAllCurrencies, loadReport]);

  // -- Handlers --
  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) { notify(json.error || "Switch failed", "danger"); return; }
      setCompanyId(Number(c.id));
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      notifyCompanySessionUpdated();
    } catch { notify("Switch failed", "danger"); }
  };

  const onGroupClick = (gid) => {
    if (selectedGroup === gid) {
      setSelectedGroup(null);
      sessionStorage.removeItem("dashboard_group_filter");
    } else {
      setSelectedGroup(gid);
      sessionStorage.setItem("dashboard_group_filter", gid);
    }
  };

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

  if (bootLoading || !me) return null;

  return (
    <div className="container">
      <div className="content">
        <div className="report-header">
          <h1 className="account-page-title">Customer Report</h1>
        </div>
        <div className="account-separator-line" />

        <CustomerReportFilters 
          companyId={companyId}
          onSwitchCompany={onSwitchCompany}
          companies={companies}
          selectedGroup={selectedGroup}
          onGroupClick={onGroupClick}
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
        />

        <CustomerReportTable 
          reportData={reportData}
          loading={loading}
          error={error}
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
