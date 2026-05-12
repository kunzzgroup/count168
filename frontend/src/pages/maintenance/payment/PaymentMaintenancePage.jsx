import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { removeOtherMaintenanceStylesheets, waitForStylesheet } from "../../../utils/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/maintenanceDateRangePicker.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import { applySharedGroupClickWithCompanySwitch } from "../../../utils/sharedCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/payment_maintenance.css";
import {
  fetchCompanyPermissions,
  fetchCompanyCurrencies,
  searchPaymentData,
  deletePaymentRecords,
  updateSessionCompany,
} from "./paymentMaintenanceLogic.js";
import { useLoginLang } from "../../../utils/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/maintenanceTranslate.js";
import MaintenanceCalendarPopup from "../shared/MaintenanceCalendarPopup.jsx";

// Components
import PaymentMaintenanceFilters from "./components/PaymentMaintenanceFilters.jsx";
import PaymentMaintenanceTable from "./components/PaymentMaintenanceTable.jsx";
import ConfirmDeleteModal from "../capture/components/ConfirmDeleteModal.jsx"; // Reuse from capture

export default function PaymentMaintenancePage() {
  const navigate = useNavigate();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);

  // -- Boot State --
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [permissions, setPermissions] = useState([]);

  // -- Filter State --
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [transactionType, setTransactionType] = useState("");
  const [activePermission, setActivePermission] = useState("");
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  
  const today = useMemo(() => new Date(), []);
  const todayDmy = useMemo(() => {
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }, [today]);
  const [dateFrom, setDateFrom] = useState(todayDmy);
  const [dateTo, setDateTo] = useState(todayDmy);
  const [cssReady, setCssReady] = useState(false);

  // -- Data State --
  const [paymentData, setPaymentData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const companyIdRef = useRef(null);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      notify(t("operationCompletedSuccess"), "success");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (params.get("error") === "1") {
      notify(t("operationFailedRetry"), "error");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [notify, t]);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    // Force native page scrolling even when legacy CSS applies viewport locks.
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

    let cancelled = false;

    removeOtherMaintenanceStylesheets("payment_maintenance.css");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      // local styles are imported statically so only external stylesheets need runtime loading
    ];

    Promise.all(links.map(waitForStylesheet)).then(() => {
      if (!cancelled) setCssReady(true);
    });

    ensureMaintenanceDateRangePicker();

    return () => {
      cancelled = true;
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
    if (bootLoading || !me) return;
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
  }, [bootLoading, me]);

  useEffect(() => {
    if (bootLoading || !me) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
    });
  }, [bootLoading, me, lang, t]);

  // Handle sidebar company switch
  useEffect(() => {
    const handleSwitch = (e) => {
      if (!e.detail) return;
      const { companyId, companyCode } = e.detail;
      if (Number(companyId) === Number(companyIdRef.current)) return;

      companyIdRef.current = companyId;
      setCompanyId(Number(companyId));
      setCompanyCode(companyCode);
      setPaymentData([]);
      setSelectedIds([]);
      setConfirmDelete(false);
    };

    window.addEventListener("eazycount:company-session-updated", handleSwitch);
    return () => window.removeEventListener("eazycount:company-session-updated", handleSwitch);
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

        // Legacy parity: payment_maintenance.php only enforced logged-in session.
        setMe(u);

        // Load Companies
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        // Set Initial Company
        let initialCompanyId = u.company_id ? Number(u.company_id) : (rows[0]?.id ? Number(rows[0].id) : null);
        setCompanyId(initialCompanyId);
        companyIdRef.current = initialCompanyId;
        
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

  // -- Load Meta Data (Permissions & Currencies) --
  useEffect(() => {
    if (bootLoading || !companyId) return;

    (async () => {
      try {
        const [permList, currList] = await Promise.all([
          fetchCompanyPermissions(companyCode),
          fetchCompanyCurrencies(companyId)
        ]);
        setPermissions(permList);
        setCurrencies(currList);
        
        // Initial permission
        const savedPerm = localStorage.getItem(`selectedPermission_${companyCode}`);
        if (savedPerm && permList.includes(savedPerm)) {
          setActivePermission(savedPerm);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }

        // Initial currency
        const hasMYR = currList.some(c => c.code === "MYR");
        setSelectedCurrency(hasMYR ? "MYR" : (currList[0]?.code || null));
        
      } catch (err) {
        console.error("Meta data load error:", err);
        notify(t("failedLoadCompanyMetadata"), "error");
      }
    })();
  }, [bootLoading, companyId, companyCode, notify, t]);

  // -- Search Logic --
  const performSearch = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const data = await searchPaymentData({
        dateFrom,
        dateTo,
        transactionType,
        companyId,
        currency: selectedCurrency
      });
      setPaymentData(data);
      setSelectedIds([]);
      setConfirmDelete(false);
      if (data.length === 0) {
        notify(t("noDataFound"), "info");
      } else {
        notify(t("foundRecords", { n: data.length }), "success");
      }
    } catch (err) {
      notify(err.message, "error");
      setPaymentData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, transactionType, selectedCurrency, notify, t]);

  // Auto-search when filters change
  useEffect(() => {
    if (!bootLoading && companyId) {
      performSearch();
    }
  }, [bootLoading, companyId, transactionType, dateFrom, dateTo, selectedCurrency, performSearch]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      await updateSessionCompany(c.id);
      setCompanyId(Number(c.id));
      companyIdRef.current = Number(c.id);
      setCompanyCode(c.company_id || "");
      
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      
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
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const selectable = paymentData.filter(r => !(r.is_deleted === 1 || r.is_deleted === '1' || r.is_deleted === true));
    if (selectedIds.length === selectable.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable.map(r => r.transaction_id));
    }
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      notify(t("pleaseConfirmDeletionCheckbox"), "error");
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
      await deletePaymentRecords(selectedIds);
      notify(t("successfullyDeletedN", { n: selectedIds.length }), "success");
      performSearch();
    } catch (err) {
      notify(err.message || t("deleteFailed"), "error");
    }
  };

  if (bootLoading || !me || !cssReady) return null;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{m.pageTitlePayment}</h1>
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

      <PaymentMaintenanceFilters 
        transactionType={transactionType}
        setTransactionType={setTransactionType}
        dateFrom={dateFrom}
        dateTo={dateTo}
        today={todayDmy}
        companyId={companyId}
        companies={companies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onSwitchCompany={handleSwitchCompany}
        currencies={currencies}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        onDelete={handleDeleteClick}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        deleteDisabled={selectedIds.length === 0 || !confirmDelete}
        m={m}
      />

      <PaymentMaintenanceTable
        data={paymentData}
        loading={loading}
        selectedIds={selectedIds}
        toggleSelect={toggleSelect}
        toggleSelectAll={toggleSelectAll}
        selectAll={selectedIds.length > 0 && selectedIds.length === paymentData.filter(r => !(r.is_deleted === 1 || r.is_deleted === '1' || r.is_deleted === true)).length}
        m={m}
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

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>
      <MaintenanceCalendarPopup months={m.monthsShort} weekdays={m.weekdaysShort} />
    </div>
  );
}
