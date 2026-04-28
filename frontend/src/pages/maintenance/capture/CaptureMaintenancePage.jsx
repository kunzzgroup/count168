import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";
import { formatYmd, quickRangeToDates } from "../../../utils/dateUtils.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import { 
  fetchCompanyPermissions, 
  fetchProcesses, 
  searchCaptureData, 
  deleteCaptureItems,
  updateSessionCompany 
} from "./captureMaintenanceLogic.js";

// Components
import CaptureMaintenanceFilters from "./components/CaptureMaintenanceFilters.jsx";
import CaptureMaintenanceTable from "./components/CaptureMaintenanceTable.jsx";
import ConfirmDeleteModal from "./components/ConfirmDeleteModal.jsx";

export default function CaptureMaintenancePage() {
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
  const [captureData, setCaptureData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // -- UI State --
  const [toast, setToast] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const toastTimerRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    // Inject legacy CSS (keeping design intact)
    const links = [
      "https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      assetUrl("css/accountCSS.css"),
      assetUrl("css/transaction.css"),
      assetUrl("css/capture_maintenance.css"),
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
        setCompanies(rows);

        // Set Initial Company
        let initialCompanyId = u.company_id ? Number(u.company_id) : (rows[0]?.id ? Number(rows[0].id) : null);
        setCompanyId(initialCompanyId);
        
        const currentComp = rows.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          setCompanyCode(currentComp.company_id || "");
          
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
        companyId
      });
      setCaptureData(data);
      if (data.length === 0) {
        notify("No data found", "info");
      } else {
        notify(`Found ${data.length} record(s)`, "success");
      }
    } catch (err) {
      notify(err.message, "error");
      setCaptureData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, selectedProcess, notify]);

  // Auto-search when filters change
  useEffect(() => {
    if (!bootLoading && companyId) {
      performSearch();
    }
  }, [bootLoading, companyId, selectedProcess, dateFrom, dateTo, performSearch]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      await updateSessionCompany(c.id);
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
    // Note: sidebar visibility updates are usually handled by global state or re-render in SPA
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

  if (bootLoading || !me) return null;

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
        onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
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
      {toast && (
        <div id="notificationContainer" className="maintenance-notification-container">
          <div className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmDeleteModal 
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteAction}
        message={`Are you sure you want to delete the selected ${selectedIds.length} record(s)? This action cannot be undone.`}
      />
    </div>
  );
}
