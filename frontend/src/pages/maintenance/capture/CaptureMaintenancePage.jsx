import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
/* 与 DataCapture 相同：打进 Vite 产物，避免 dynamic import 在生产包中被拆成空 chunk、样式从未加载 */
import "../../../../public/css/capture_maintenance.css";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { removeOtherMaintenanceStylesheets, waitForStylesheet } from "../../../utils/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/maintenanceDateRangePicker.js";
import { formatYmd } from "../../../utils/dateUtils.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import { applySharedGroupClickWithCompanySwitch } from "../../../utils/sharedCompanyFilter.js";
import { 
  fetchCompanyPermissions, 
  fetchProcesses, 
  searchCaptureData, 
  deleteCaptureItems,
  updateSessionCompany 
} from "./captureMaintenanceLogic.js";

// Componentss
import CaptureMaintenanceFilters from "./components/CaptureMaintenanceFilters.jsx";
import CaptureMaintenanceTable from "./components/CaptureMaintenanceTable.jsx";
import ConfirmDeleteModal from "./components/ConfirmDeleteModal.jsx";

export default function CaptureMaintenancePage() {
  const navigate = useNavigate();

  // -- Boot State ---
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
  const todayDmy = useMemo(() => {
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }, [today]);
  const [dateFrom, setDateFrom] = useState(todayDmy);
  const [dateTo, setDateTo] = useState(todayDmy);

  // -- Data State --
  const [processes, setProcesses] = useState([]);
  const [captureData, setCaptureData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cssReady, setCssReady] = useState(false);

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

    const targets = [document.documentElement, document.body, document.getElementById("root")].filter(Boolean);
    const originalStyles = targets.map((el) => ({
      el,
      overflow: el.style.getPropertyValue("overflow"),
      overflowPriority: el.style.getPropertyPriority("overflow"),
      overflowY: el.style.getPropertyValue("overflow-y"),
      overflowYPriority: el.style.getPropertyPriority("overflow-y"),
      overflowX: el.style.getPropertyValue("overflow-x"),
      overflowXPriority: el.style.getPropertyPriority("overflow-x"),
      height: el.style.getPropertyValue("height"),
      heightPriority: el.style.getPropertyPriority("height"),
      minHeight: el.style.getPropertyValue("min-height"),
      minHeightPriority: el.style.getPropertyPriority("min-height"),
      maxHeight: el.style.getPropertyValue("max-height"),
      maxHeightPriority: el.style.getPropertyPriority("max-height"),
    }));
    targets.forEach((el) => {
      el.style.setProperty("overflow", "auto", "important");
      el.style.setProperty("overflow-y", "auto", "important");
      el.style.setProperty("overflow-x", "hidden", "important");
      el.style.setProperty("height", "auto", "important");
      el.style.setProperty("min-height", "100vh", "important");
      el.style.setProperty("max-height", "none", "important");
    });

    removeOtherMaintenanceStylesheets("capture_maintenance.css");

    let cancelled = false;

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];

    Promise.all(links.map(waitForStylesheet)).then(() => {
      if (!cancelled) setCssReady(true);
    });

    ensureMaintenanceDateRangePicker();

    return () => {
      cancelled = true;
      setCssReady(false);
      originalStyles.forEach((item) => {
        const { el } = item;
        if (item.overflow) el.style.setProperty("overflow", item.overflow, item.overflowPriority);
        else el.style.removeProperty("overflow");
        if (item.overflowY) el.style.setProperty("overflow-y", item.overflowY, item.overflowYPriority);
        else el.style.removeProperty("overflow-y");
        if (item.overflowX) el.style.setProperty("overflow-x", item.overflowX, item.overflowXPriority);
        else el.style.removeProperty("overflow-x");
        if (item.height) el.style.setProperty("height", item.height, item.heightPriority);
        else el.style.removeProperty("height");
        if (item.minHeight) el.style.setProperty("min-height", item.minHeight, item.minHeightPriority);
        else el.style.removeProperty("min-height");
        if (item.maxHeight) el.style.setProperty("max-height", item.maxHeight, item.maxHeightPriority);
        else el.style.removeProperty("max-height");
      });
      document.body.classList.remove("maintenance-page");
    };
  }, []);

  useEffect(() => {
    if (bootLoading || !me || !cssReady) return;
    if (!document.getElementById("date-range-picker")) return;
    if (!window?.MaintenanceDateRangePicker?.init) return;

    const timer = setTimeout(() => {
      window.MaintenanceDateRangePicker.init({
        onChange: () => {
          const nextFrom = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
          const nextTo = window.MaintenanceDateRangePicker.getDateTo?.() || "";
          setDateFrom(nextFrom);
          setDateTo(nextTo);
        },
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [bootLoading, me, cssReady]);

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
        
        // Sidebar visibility check
        if (!canMaintenance) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);

        // Load Companies
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        // Set Initial Company
        let initialCompanyId = u.company_id ? Number(u.company_id) : (rows[0]?.id ? Number(rows[0].id) : null);
        setCompanyId(initialCompanyId);
        
        const currentComp = rows.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          setCompanyCode(currentComp.company_id || "");
          const companyPerms = await fetchCompanyPermissions(currentComp.company_id || "");
          const hasGames = companyPerms.includes("Games") || companyPerms.includes("Gambling");
          const bankOnly = companyPerms.includes("Bank") && !hasGames;
          if (bankOnly) {
            navigate("/process-list", { replace: true });
            return;
          }
          if (!hasGames) {
            navigate("/dashboard", { replace: true });
            return;
          }
          
          const savedGroup = sessionStorage.getItem("dashboard_group_filter");
          const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
          
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
        
        // Initial permission from localStorage or first one
        const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
        if (saved && permList.includes(saved)) {
          setActivePermission(saved);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }
      } catch (err) {
        console.error("Meta data load error:", err);
        notify("Failed to load processes", "error");
      }
    })();
  }, [bootLoading, companyId, companyCode, notify]);

  // -- Search Logic --
  const performSearch = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return;
    setLoading(true);
    setSelectedIds([]);
    try {
      const data = await searchCaptureData({
        dateFrom,
        dateTo,
        process: selectedProcess,
        companyId,
        category: activePermission
      });
      setCaptureData(data);
      if (data.length > 0) {
        notify(`Found ${data.length} record(s)`, "success");
      }
    } catch (err) {
      notify(err.message, "error");
      setCaptureData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, selectedProcess, activePermission, notify]);

  // Auto-search when filters change
  useEffect(() => {
    if (!bootLoading && companyId && cssReady) {
      performSearch();
    }
  }, [bootLoading, companyId, selectedProcess, dateFrom, dateTo, activePermission, performSearch, cssReady]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const sessionData = await updateSessionCompany(c.id);
      
      // Redirect to process list for bank-only companies (legacy parity).
      if (sessionData && sessionData.has_gambling === false) {
        navigate("/process-list", { replace: true });
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
      // Fallback redirect if something goes wrong during session update
      navigate("/dashboard", { replace: true });
    }
  };

  const handleGroupClick = async (gid) => {
    await applySharedGroupClickWithCompanySwitch({
      clickedGroupId: gid,
      currentSelectedGroup: selectedGroup,
      companies,
      currentCompanyId: companyId,
      setSelectedGroup,
      switchCompany: handleSwitchCompany,
    });
  };

  const handlePermissionSwitch = (p) => {
    if (p === activePermission) return;
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const selectable = captureData.filter(row => !(row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true));
    if (selectedIds.length === selectable.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable.map(row => row.capture_id));
    }
  };

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) {
      notify("Please select at least one record", "error");
      return;
    }
    setShowDeleteModal(true);
  };

  const confirmDeleteAction = async () => {
    setShowDeleteModal(false);
    setLoading(true);
    try {
      const itemsToDelete = captureData
        .filter(row => selectedIds.includes(row.capture_id))
        .map(row => ({
          capture_id: Number(row.capture_id),
          process_id: row.process_id || row.process || null,
          currency_id: row.currency_id ? Number(row.currency_id) : null
        }));

      await deleteCaptureItems({
        items: itemsToDelete,
        dateFrom,
        dateTo
      });

      notify("Delete successful", "success");
      setConfirmDelete(false);
      setSelectedIds([]);
      await performSearch();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  if (bootLoading || !me || !cssReady) return null;

  const selectableRows = captureData.filter(row => !(row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true));
  const isAllSelected = selectableRows.length > 0 && selectedIds.length === selectableRows.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < selectableRows.length;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">Maintenance - Data Capture</h1>
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

      <CaptureMaintenanceFilters 
        processes={processes}
        selectedProcess={selectedProcess}
        setSelectedProcess={setSelectedProcess}
        dateFrom={dateFrom}
        dateTo={dateTo}
        today={todayDmy}
        companyId={companyId}
        companies={companies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onSwitchCompany={handleSwitchCompany}
        onDelete={handleDeleteClick}
        canDelete={selectedIds.length > 0}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
      />

      <CaptureMaintenanceTable 
        data={captureData}
        loading={loading}
        selectedIds={selectedIds}
        toggleSelect={toggleSelect}
        toggleSelectAll={toggleSelectAll}
        isAllSelected={isAllSelected}
        isIndeterminate={isIndeterminate}
      />

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map(t => (
          <div key={t.id} className={`maintenance-notification maintenance-notification-${t.type} show`}>
            {t.message}
          </div>
        ))}
      </div>
      {/* Confirm Modal */}
      <ConfirmDeleteModal 
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteAction}
        message={`Are you sure you want to delete the selected ${selectedIds.length} record(s)? This action cannot be undone.`}
      />
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}><i className="fas fa-chevron-left" /></button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
            <select id="calendar-month-select" defaultValue="0"><option value="0">Jan</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Apr</option><option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Aug</option><option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dec</option></select>
            <select id="calendar-year-select" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div><div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
