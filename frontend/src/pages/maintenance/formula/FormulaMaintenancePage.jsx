import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoginLang } from "../../../utils/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N, getFormulaInputMethodOptions } from "../../../translateFile/maintenanceTranslate.js";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenanceStylesheets.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import { applySharedGroupClickWithCompanySwitch } from "../../../utils/sharedCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/formula_maintenance.css";
import { 
  fetchCompanyPermissions, 
  fetchCompanyPermissionsRaw,
  fetchProcesses,
  fetchAccounts,
  listFormulaTemplates,
  updateFormulaTemplate,
  deleteFormulaTemplates,
  updateSessionCompany,
  isBankOnlyCategoryCompany
} from "./formulaMaintenanceLogic.js";

// Components
import FormulaMaintenanceFilters from "./components/FormulaMaintenanceFilters.jsx";
import FormulaMaintenanceTable from "./components/FormulaMaintenanceTable.jsx";
import ConfirmDeleteModal from "../capture/components/ConfirmDeleteModal.jsx";

export default function FormulaMaintenancePage() {
  const navigate = useNavigate();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);
  const inputMethodOptions = useMemo(() => getFormulaInputMethodOptions(lang), [lang]);

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
  const [searchFilter, setSearchFilter] = useState("");
  const [activePermission, setActivePermission] = useState("");
  const [processes, setProcesses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  
  // -- Data State --
  const [formulaData, setFormulaData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // -- UI State --
  const [toast, setToast] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const toastTimerRef = useRef(null);
  const searchDebounceRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page", "maintenance-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    // Force native page scrolling even when legacy dashboard CSS locks viewport.
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

    removeOtherMaintenanceStylesheets("formula_maintenance.css");

    const ensureStylesheetLast = (href) => {
      const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
      if (existing) {
        document.head.appendChild(existing);
        return;
      }
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    };

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];

    links.forEach(ensureStylesheetLast);

    return () => {
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
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
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
        const canMaintenance = hasFull || perms.includes("maintenance");
        if (!canMaintenance) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);

        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        let initialCompanyId = u.company_id ? Number(u.company_id) : (rows[0]?.id ? Number(rows[0].id) : null);
        setCompanyId(initialCompanyId);
        
        const currentComp = rows.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          setCompanyCode(currentComp.company_id || "");
          const companyPerms = await fetchCompanyPermissionsRaw(currentComp.company_id || "");
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

  // -- Load Meta Data --
  useEffect(() => {
    if (bootLoading || !companyId) return;

    (async () => {
      try {
        const [permList, procList, accList] = await Promise.all([
          fetchCompanyPermissions(companyCode),
          fetchProcesses(companyId),
          fetchAccounts(companyId)
        ]);
        setPermissions(permList);
        setProcesses(procList);
        setAccounts(accList);
        
        const savedPerm = localStorage.getItem(`selectedPermission_${companyCode}`);
        if (savedPerm && permList.includes(savedPerm)) {
          setActivePermission(savedPerm);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }
      } catch (err) {
        notify(t("failedLoadCompanyMetadata"), "error");
      }
    })();
  }, [bootLoading, companyId, companyCode, notify]);

  // -- Search Logic --
  const performSearch = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await listFormulaTemplates({
        companyId,
        category: activePermission,
        process: selectedProcess,
        search: searchFilter
      });
      setFormulaData(data);
      setSelectedIds([]);
      setConfirmDelete(false);
      if (data.length === 0) {
        notify(t("noDataFound"), "info");
      } else {
        notify(t("foundRecords", { n: data.length }), "success");
      }
    } catch (err) {
      notify(err.message, "error");
      setFormulaData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, activePermission, selectedProcess, searchFilter, notify, t]);

  // Debounced search for searchFilter
  useEffect(() => {
    if (!bootLoading && companyId) {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        // Legacy behavior: only search when user enters search text or selects process.
        if (searchFilter || selectedProcess) {
          performSearch();
        }
      }, 300);
    }
  }, [bootLoading, companyId, searchFilter, selectedProcess, performSearch]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      await updateSessionCompany(c.id);
      const perms = await fetchCompanyPermissionsRaw(c.company_id || "");
      if (isBankOnlyCategoryCompany(perms)) {
        navigate("/process-list", { replace: true });
        return;
      }
      setCompanyId(Number(c.id));
      setCompanyCode(c.company_id || "");
      
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      
      // Reset filters when switching company
      setSearchFilter("");
      setSelectedProcess("");
      setFormulaData([]);
      
      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: c.company_id }), "success");
    } catch (err) {
      notify(err.message || t("switchFailed"), "error");
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
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
    // Legacy parity: permission switch resets list and filters.
    setSearchFilter("");
    setSelectedProcess("");
    setFormulaData([]);
    setSelectedIds([]);
    setConfirmDelete(false);
  };

  const handleClearFilters = () => {
    setSearchFilter("");
    setSelectedProcess("");
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === formulaData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(formulaData.map(r => r.id));
    }
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      notify(t("pleaseConfirmDeleteCheckbox"), "error");
      return;
    }
    if (selectedIds.length === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      await deleteFormulaTemplates(companyId, selectedIds);
      notify(t("successfullyDeletedN", { n: selectedIds.length }), "success");
      performSearch();
    } catch (err) {
      notify(err.message || t("deleteFailed"), "error");
    }
  };

  const handleSaveRow = async (id, editForm) => {
    try {
      const payload = {
        template_id: id,
        company_id: companyId,
        ...editForm
      };
      await updateFormulaTemplate(payload);
      notify(t("updateSuccessful"), "success");
      performSearch();
      return true;
    } catch (err) {
      notify(err.message || t("saveFailed"), "error");
      return false;
    }
  };

  if (bootLoading || !me) return null;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{m.pageTitleFormula}</h1>
        {permissions.length > 1 && (
          <div id="maintenance-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">{m.category}</span>
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

      <FormulaMaintenanceFilters 
        processes={processes}
        selectedProcess={selectedProcess}
        setSelectedProcess={setSelectedProcess}
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        companyId={companyId}
        companies={companies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onSwitchCompany={handleSwitchCompany}
        onClearFilters={handleClearFilters}
        selectedIds={selectedIds}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        onDelete={handleDeleteClick}
        m={m}
      />

      <FormulaMaintenanceTable
        data={formulaData}
        loading={loading}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onSaveRow={handleSaveRow}
        accounts={accounts}
        m={m}
        inputMethodOptions={inputMethodOptions}
      />

      {/* Modal & Notifications */}
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title={m.confirmDeleteTitle}
        cancelText={m.cancel}
        confirmText={m.delete}
        message={t("deleteConfirmRecords", { count: selectedIds.length })}
      />

      {toast && (
        <div id="notificationContainer" className="maintenance-notification-container">
          <div className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
