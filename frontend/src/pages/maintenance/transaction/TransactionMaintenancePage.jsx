import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData, isCancelledError } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/maintenanceDateRangePicker.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import { applySharedGroupClickWithCompanySwitch } from "../../../utils/sharedCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/transaction_maintenance.css";
import {
  fetchCompanyPermissions,
  fetchProcesses,
  isBankOnlyCategoryCompany,
  normalizeMaintenanceProcessFilter,
  searchTransactionData,
  updateSessionCompany,
} from "./transactionMaintenanceLogic.js";
import { useLoginLang } from "../../../utils/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/maintenanceTranslate.js";

// Components
import TransactionMaintenanceFilters from "./components/TransactionMaintenanceFilters.jsx";
import TransactionMaintenanceTable from "./components/TransactionMaintenanceTable.jsx";

/**
 * Dedupe "no data" toast on Transaction Maintenance.
 * React 18 Strict Mode remounts the tree in dev: component refs reset, so ref-based
 * dedupe fires twice for the same successful empty response.
 */
const transactionMaintenanceNoDataToastKeys = new Set();
const MAX_NO_DATA_TOAST_KEYS = 64;

function consumeNoDataToastDedupeKey(key) {
  if (!key || transactionMaintenanceNoDataToastKeys.has(key)) return false;
  transactionMaintenanceNoDataToastKeys.add(key);
  while (transactionMaintenanceNoDataToastKeys.size > MAX_NO_DATA_TOAST_KEYS) {
    const first = transactionMaintenanceNoDataToastKeys.values().next().value;
    transactionMaintenanceNoDataToastKeys.delete(first);
  }
  return true;
}

export default function TransactionMaintenancePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const [toasts, setToasts] = useState([]);
  const [cssReady, setCssReady] = useState(false);
  /** Boot finished metadata; date picker synced — avoids racing search with boot/meta fetches. */
  const [filtersReady, setFiltersReady] = useState(false);
  const [dateRangeReady, setDateRangeReady] = useState(false);
  const [searchDeferredReady, setSearchDeferredReady] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);

  // -- Data State --
  const [processes, setProcesses] = useState([]);
  /** When set, meta effect reuses permissions from the last company switch instead of calling domain_api again. */
  const switchPermsCacheRef = useRef(null);
  /** Boot already loaded process/permission meta — skip duplicate meta effect on first paint. */
  const skipMetaAfterBootRef = useRef(false);

  const processFilter = useMemo(
    () => normalizeMaintenanceProcessFilter(selectedProcess),
    [selectedProcess],
  );

  const maintenanceQueryKey = useMemo(
    () => [
      "transaction-maintenance",
      companyId,
      dateFrom,
      dateTo,
      processFilter,
      activePermission || "",
    ],
    [companyId, dateFrom, dateTo, processFilter, activePermission],
  );

  const listQueryEnabled = Boolean(
    !bootLoading &&
    filtersReady &&
    dateRangeReady &&
    companyId &&
    dateFrom &&
    dateTo &&
    cssReady &&
    (permissions.length === 0 || activePermission),
  );

  const transactionQuery = useQuery({
    queryKey: maintenanceQueryKey,
    queryFn: ({ signal }) =>
      searchTransactionData({
        dateFrom,
        dateTo,
        process: processFilter,
        companyId,
        category: activePermission,
        signal,
        onFirstPage: (rows) => {
          queryClient.setQueryData(maintenanceQueryKey, rows);
        },
      }),
    enabled: listQueryEnabled && searchDeferredReady && !switchingCompany,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) =>
      error?.name !== "AbortError" && !isCancelledError(error) && failureCount < 2,
  });

  const transactionData = transactionQuery.data ?? [];
  const listRowCount = transactionData.length;
  /** 无上一屏数据且请求中：仅显示简洁 Loading 文案（不显示骨架行） */
  const showListSkeleton =
    listQueryEnabled &&
    (transactionQuery.isLoading || (transactionQuery.isFetching && listRowCount === 0));
  const lastToastKeyRef = useRef(null);
  const lastErrorMsgRef = useRef(null);
  const lastErrorQueryKeyRef = useRef("");

  const searchQueryKey = useMemo(
    () =>
      JSON.stringify([
        companyId,
        dateFrom,
        dateTo,
        processFilter,
        activePermission || "",
      ]),
    [companyId, dateFrom, dateTo, processFilter, activePermission],
  );

  useEffect(() => {
    lastErrorMsgRef.current = null;
    lastErrorQueryKeyRef.current = "";
  }, [searchQueryKey]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => {
      if (prev.some(t => t.message === message)) return prev;
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

    let cancelled = false;

    removeOtherMaintenanceStylesheets("transaction_maintenance.css");
    ensureMaintenanceDateRangePicker();
    // Fonts/icons are in index.html; page CSS is bundled via imports — do not block on third-party CDN
    // (some networks/devices block or stall fonts.googleapis.com / cdnjs → blank page + "failed to load resource").
    setCssReady(true);

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
    setDateRangeReady(true);
  }, [bootLoading, me, cssReady]);

  // Defer first search one tick after filters are ready (align with Payment/Capture maintenance).
  useEffect(() => {
    if (!listQueryEnabled) {
      setSearchDeferredReady(false);
      return;
    }
    const timer = setTimeout(() => setSearchDeferredReady(true), 0);
    return () => {
      clearTimeout(timer);
      setSearchDeferredReady(false);
    };
  }, [listQueryEnabled]);

  useEffect(() => {
    if (bootLoading || !me || !cssReady) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: m.monthsShort,
    });
  }, [bootLoading, me, cssReady, lang, t, m]);

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
        if (!canMaintenance) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);

        // Load Companies
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        
        const filtered = rows;
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
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          // Fetch initial metadata here to ensure the first query starts with the correct activePermission
          const [companyPerms, procList] = await Promise.all([
            fetchCompanyPermissions(code),
            fetchProcesses(initialCompanyId)
          ]);

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

          setPermissions(companyPerms);
          setProcesses(procList);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = savedPerm && companyPerms.includes(savedPerm) ? savedPerm : (companyPerms.length > 0 ? companyPerms[0] : "");
          setActivePermission(initialActive);

          // Cache permissions so the meta-effect below skips redundant API call
          switchPermsCacheRef.current = { companyCode: code, perms: companyPerms };
          skipMetaAfterBootRef.current = true;

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
        setFiltersReady(true);
        setBootLoading(false);
      }
    })();
  }, [navigate]);

  // -- Load Meta Data (Processes & Permissions) --
  useEffect(() => {
    if (bootLoading || !companyId) return;
    if (skipMetaAfterBootRef.current) {
      skipMetaAfterBootRef.current = false;
      return;
    }

    let cancelled = false;
    const cid = companyId;
    const ccode = companyCode;

    (async () => {
      try {
        const procList = await fetchProcesses(cid);
        if (cancelled) return;
        setProcesses(procList);
        setSelectedProcess((prev) => {
          const filter = normalizeMaintenanceProcessFilter(prev);
          if (!filter) return "";
          return procList.some((p) => String(p.process_name) === filter) ? filter : "";
        });

        const cached = switchPermsCacheRef.current;
        let permList;
        if (cached && cached.companyCode === ccode) {
          permList = cached.perms;
          switchPermsCacheRef.current = null;
        } else {
          permList = await fetchCompanyPermissions(ccode);
        }
        if (cancelled) return;
        setPermissions(permList);

        const saved = localStorage.getItem(`selectedPermission_${ccode}`);
        if (saved && permList.includes(saved)) {
          setActivePermission(saved);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Meta data load error:", err);
        notify(t("failedLoadMetaData"), "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootLoading, companyId, companyCode, notify, t]);

  useEffect(() => {
    if (!transactionQuery.isSuccess || !transactionData.length) return;
    if (transactionQuery.isPlaceholderData) return;
    const key = `${transactionQuery.dataUpdatedAt}:${transactionData.length}`;
    if (lastToastKeyRef.current === key) return;
    lastToastKeyRef.current = key;
    notify(t("foundRecords", { n: transactionData.length }), "success");
  }, [transactionQuery.isSuccess, transactionQuery.dataUpdatedAt, transactionQuery.isPlaceholderData, transactionData.length, notify, t]);

  useEffect(() => {
    if (!listQueryEnabled) return;
    if (!transactionQuery.isSuccess) return;
    if (transactionQuery.isFetching) return;
    if (transactionData.length > 0) return;
    const key = `${transactionQuery.dataUpdatedAt ?? ""}:empty`;
    if (!consumeNoDataToastDedupeKey(key)) return;
    notify(t("noDataAdjustSearch"), "info");
  }, [
    listQueryEnabled,
    transactionQuery.isSuccess,
    transactionQuery.isFetching,
    transactionData.length,
    transactionQuery.dataUpdatedAt,
    notify,
    t,
  ]);

  useEffect(() => {
    if (!transactionQuery.isError || !transactionQuery.error) return;
    if (transactionQuery.isFetching) return;
    if (transactionQuery.error?.name === "AbortError" || isCancelledError(transactionQuery.error)) return;
    const errorKey = `${searchQueryKey}:${transactionQuery.errorUpdatedAt ?? ""}`;
    if (lastErrorQueryKeyRef.current === errorKey) return;
    const msg = transactionQuery.error.message || t("searchFailed");
    if (lastErrorMsgRef.current === msg) return;
    lastErrorQueryKeyRef.current = errorKey;
    lastErrorMsgRef.current = msg;
    notify(msg, "error");
  }, [
    transactionQuery.isError,
    transactionQuery.error,
    transactionQuery.isFetching,
    transactionQuery.errorUpdatedAt,
    searchQueryKey,
    notify,
    t,
  ]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    setSwitchingCompany(true);
    try {
      const nextCompanyId = Number(c.id);
      const [res, perms, procList] = await Promise.all([
        updateSessionCompany(c.id),
        fetchCompanyPermissions(c.company_id),
        fetchProcesses(nextCompanyId),
      ]);

      // Legacy Redirect logic
      if (res.has_gambling === false) {
        navigate("/process-list", { replace: true });
        return;
      }

      if (isBankOnlyCategoryCompany(perms)) {
        navigate("/process-list", { replace: true });
        return;
      }

      const code = c.company_id || "";
      const saved = localStorage.getItem(`selectedPermission_${code}`);
      const nextActive =
        saved && perms.includes(saved) ? saved : perms.length > 0 ? perms[0] : "";
      switchPermsCacheRef.current = { companyCode: code, perms };
      skipMetaAfterBootRef.current = true;
      setActivePermission(nextActive);
      setPermissions(perms);
      setProcesses(procList);
      setSelectedProcess("");

      setCompanyId(nextCompanyId);
      setCompanyCode(code);
      
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      
      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: c.company_id }), "success");
    } catch (err) {
      notify(err.message || t("switchFailed"), "error");
    } finally {
      setSwitchingCompany(false);
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

  if (bootLoading || !me || !cssReady) return null;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{m.pageTitleTransaction}</h1>
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

      <div className="transaction-maintenance-page-root">
        <TransactionMaintenanceFilters 
          processes={processes}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          today={todayDmy}
          companyId={companyId}
          companies={companies}
          selectedGroup={selectedGroup}
          onGroupClick={handleGroupClick}
          onSwitchCompany={handleSwitchCompany}
          m={m}
        />

        <TransactionMaintenanceTable
          data={transactionData}
          showSkeleton={showListSkeleton}
          isPlaceholderData={transactionQuery.isPlaceholderData}
          isError={transactionQuery.isError}
          error={transactionQuery.error}
          m={m}
        />
      </div>

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
