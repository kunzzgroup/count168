import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";
import { formatYmd } from "../../../utils/dateUtils.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import { 
  fetchCompanyPermissions, 
  fetchProcesses, 
  isBankOnlyCategoryCompany,
  searchTransactionData, 
  updateSessionCompany 
} from "./transactionMaintenanceLogic.js";

// Components
import TransactionMaintenanceFilters from "./components/TransactionMaintenanceFilters.jsx";
import TransactionMaintenanceTable from "./components/TransactionMaintenanceTable.jsx";

export default function TransactionMaintenancePage() {
  const navigate = useNavigate();

  // -- Boot State --
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [permissions, setPermissions] = useState([]);

  // -- Filter State --
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedProcess, setSelectedProcess] = useState("");
  const [activePermission, setActivePermission] = useState("");
  
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  // -- Data State --
  const [processes, setProcesses] = useState([]);
  const [transactionData, setTransactionData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      if (next.length > 2) return next.slice(1);
      return next;
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
  }, []);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    // Inject legacy CSS
    const links = [
      "https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      assetUrl("css/accountCSS.css"),
      assetUrl("css/transaction.css"),
      assetUrl("css/transaction_maintenance.css"),
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
      document.body.classList.remove("maintenance-page");
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
        
        // Member check
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }

        // Permissions check
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canMaintenance = hasFull || perms.includes("maintenance");
        if (!canMaintenance || !u.company_has_gambling) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);

        // Load Companies
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        
        // Filter out C168 like legacy JS
        const filtered = rows.filter(c => String(c.company_id || '').trim().toUpperCase() !== 'C168');
        setCompanies(filtered);

        // Set Initial Company
        let initialCompanyId = u.company_id ? Number(u.company_id) : (filtered[0]?.id ? Number(filtered[0].id) : null);
        
        // Ensure initialCompanyId exists in filtered list
        if (initialCompanyId && !filtered.some(c => Number(c.id) === initialCompanyId)) {
          initialCompanyId = filtered[0]?.id ? Number(filtered[0].id) : null;
        }
        
        setCompanyId(initialCompanyId);
        
        const currentComp = filtered.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          setCompanyCode(currentComp.company_id || "");
          
          const savedGroup = sessionStorage.getItem("dashboard_group_filter");
          const groups = [...new Set(filtered.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
          
          let selGroup = null;
          if (savedGroup && groups.includes(savedGroup) && currentComp.group_id && String(currentComp.group_id).toUpperCase().trim() === savedGroup) {
            selGroup = savedGroup;
          } else if (currentComp.group_id?.trim()) {
            selGroup = String(currentComp.group_id).toUpperCase().trim();
          }
          
          setSelectedGroup(selGroup);
          if (selGroup) sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

      } catch (err) {
        console.error("Boot error:", err);
        navigate("/login", { replace: true });
      } finally {
        setBootLoading(false);
      }
    })();
  }, [navigate]);

  // -- Load Meta Data (Processes & Permissions) --
  useEffect(() => {
    if (bootLoading || !companyId) return;

    (async () => {
      try {
        const [procList, permList] = await Promise.all([
          fetchProcesses(companyId),
          fetchCompanyPermissions(companyCode)
        ]);
        setProcesses(procList);
        setPermissions(permList);
        
        const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
        if (saved && permList.includes(saved)) {
          setActivePermission(saved);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }
      } catch (err) {
        console.error("Meta data load error:", err);
        notify("Failed to load meta data", "error");
      }
    })();
  }, [bootLoading, companyId, companyCode, notify]);

  // -- Search Logic --
  const performSearch = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const data = await searchTransactionData({
        dateFrom,
        dateTo,
        process: selectedProcess,
        companyId,
        category: activePermission
      });
      setTransactionData(data);
      setHasSearched(true);
      if (data.length === 0) {
        notify("No data found", "info");
      } else {
        notify(`Found ${data.length} record(s)`, "success");
      }
    } catch (err) {
      notify(err.message, "error");
      setTransactionData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, selectedProcess, activePermission, notify]);

  // Auto-search when filters change (if has searched before or just loaded)
  useEffect(() => {
    if (!bootLoading && companyId) {
      performSearch();
    }
  }, [bootLoading, companyId, selectedProcess, dateFrom, dateTo, activePermission, performSearch]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const res = await updateSessionCompany(c.id);
      
      // Legacy Redirect logic
      if (res.has_gambling === false) {
        navigate("/dashboard", { replace: true });
        return;
      }
      
      // Fetch permissions for the new company to check Bank-only category
      const perms = await fetchCompanyPermissions(c.company_id);
      if (isBankOnlyCategoryCompany(perms)) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setCompanyId(Number(c.id));
      setCompanyCode(c.company_id || "");
      
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      
      notifyCompanySessionUpdated();
      notify(`Switched to ${c.company_id}`, "success");
    } catch (err) {
      notify(err.message || "Switch failed", "error");
    }
  };

  const handleGroupClick = (gid) => {
    if (selectedGroup === gid) {
      setSelectedGroup(null);
      sessionStorage.removeItem("dashboard_group_filter");
    } else {
      setSelectedGroup(gid);
      sessionStorage.setItem("dashboard_group_filter", gid);
    }
  };

  const handlePermissionSwitch = (p) => {
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
  };

  if (bootLoading || !me) return null;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">Maintenance - Transaction</h1>
        {permissions.length > 1 && (
          <div id="maintenance-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">Category:</span>
            <div id="maintenance-permission-buttons" className="maintenance-company-buttons">
              {permissions.map(p => (
                <button 
                  key={p} 
                  type="button" 
                  className={`maintenance-company-btn ${p === activePermission ? 'active' : ''}`}
                  onClick={() => handlePermissionSwitch(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <TransactionMaintenanceFilters 
        processes={processes}
        selectedProcess={selectedProcess}
        setSelectedProcess={setSelectedProcess}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
        companyId={companyId}
        companies={companies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onSwitchCompany={handleSwitchCompany}
      />

      <TransactionMaintenanceTable 
        data={transactionData}
        loading={loading}
      />

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map(t => (
          <div key={t.id} className={`maintenance-notification maintenance-notification-${t.type} show`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
