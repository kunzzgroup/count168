import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
/* 与 DataCapture 相同：打进 Vite 产物，避免 dynamic import 在生产包中被拆成空 chunk、样式从未加载 */
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/capture_maintenance.css";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { removeOtherMaintenanceStylesheets, waitForStylesheet } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import {
  companiesNativeInGroupList,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  readPersistedDashboardGcFilter,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
} from "../../../utils/company/sharedCompanyFilter.js";
import { isGroupLogin } from "../../../utils/company/loginScope.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import {
  bootstrapCaptureMaintenanceMeta,
  fetchCompanyPermissions,
  fetchProcesses,
  searchCaptureData,
  deleteCaptureItems,
  updateSessionCompany,
} from "./captureMaintenanceLogic.js";
import {
  captureMaintenanceScopeCacheCompanyKey,
  captureMaintenanceScopeCacheKey,
  captureMaintenanceScopeIsReady,
  captureMaintenanceUsesGroupProcesses,
  resolveCaptureMaintenanceScope,
} from "./captureMaintenanceScope.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

// Componentss
import CaptureMaintenanceFilters from "./components/CaptureMaintenanceFilters.jsx";
import CaptureMaintenanceTable from "./components/CaptureMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";

export default function CaptureMaintenancePage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);

  // -- Boot State ---
  const [bootLoading, setBootLoading] = useState(true);
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
  const [captureListEpoch, setCaptureListEpoch] = useState(0);
  const [captureDataSourceCompanyId, setCaptureDataSourceCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  /** 与 Report 页一致：非首次拉数时用细条 + 保留旧表，避免切换公司整表 Loading 卡顿感 */
  const [listSyncing, setListSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const captureSeqRef = useRef(0);
  const captureAbortRef = useRef(null);
  const scopeKeyRef = useRef("");
  const captureDataRef = useRef(captureData);
  captureDataRef.current = captureData;
  const initialCaptureSearchDoneRef = useRef(false);
  /** 切换公司已手动触发拉数时跳过 useEffect 里下一次重复请求，少等一轮渲染 */
  const suppressNextSearchEffectRef = useRef(false);
  const switchCompanyRef = useRef(async () => {});
  const onPrepareCompanySelectRef = useRef(() => {});
  const onClearCompanyRef = useRef(() => {});

  const {
    snapGroupIds,
    visibleCompanies,
    handleGroupClick,
    handlePickCompany,
    handlePickAllGroups,
    handlePickAllInGroup,
    groupsAllMode,
    groupAllMode,
    allowClearCompany,
  } = useMaintenanceGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    switchCompany: (c) => switchCompanyRef.current(c),
    onPrepareCompanySelect: (c) => onPrepareCompanySelectRef.current(c),
    onClearCompany: (...args) => onClearCompanyRef.current(...args),
  });

  const captureScope = useMemo(
    () =>
      resolveCaptureMaintenanceScope({
        companies,
        selectedGroup,
        companyId,
        groupsAllMode,
        groupAllMode,
      }),
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode],
  );

  const captureScopeKey = useMemo(
    () => captureMaintenanceScopeCacheKey(captureScope),
    [captureScope],
  );

  const listQueryEnabled =
    captureMaintenanceScopeIsReady(captureScope) && Boolean(dateFrom) && Boolean(dateTo);

  useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
    enabled: true,
  });

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

  const { guardWrite } = usePartnershipAuditWriteGuard(me, notify);

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

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];
    links.forEach((href) => waitForStylesheet(href));

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
    };
  }, []);

  useEffect(() => {
    if (bootLoading || !me) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: m.monthsShort,
    });
  }, [bootLoading, me, lang, t, m]);

  // -- Boot Logic --
  useEffect(() => {
    if (!sessionReady || !me) return;
    let cancelled = false;
    (async () => {
      try {
        const u = me;

        // Permissions check
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canMaintenance = hasFull || perms.includes("maintenance");

        // Sidebar visibility check
        if (!canMaintenance) {
          navigate("/dashboard", { replace: true });
          return;
        }

        // Load Companies
        const rows = await fetchOwnerCompaniesAll();
        if (cancelled) return;
        setCompanies(rows);

        // Set Initial Company
        const initialCompanyId = resolveBootCompanyId({
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });
        const currentComp =
          initialCompanyId != null
            ? rows.find((c) => Number(c.id) === initialCompanyId)
            : null;
        const bootGroup = resolveInitialSelectedGroupFromSession(rows, currentComp);
        setSelectedGroup(bootGroup);
        const persistedGc = readPersistedDashboardGcFilter();
        const groupOnlyBoot =
          isDashboardGroupOnlyMode() ||
          persistedGc.groupOnly ||
          isGroupLogin(u);
        if (groupOnlyBoot) {
          persistDashboardGroupOnlyMode(true);
          persistDashboardSelectedCompany(null);
          setCompanyId(null);
          setCompanyCode("");
          const bootScope = resolveCaptureMaintenanceScope({
            companies: rows,
            selectedGroup: bootGroup,
            companyId: null,
            groupsAllMode: false,
            groupAllMode: false,
          });
          const meta = await bootstrapCaptureMaintenanceMeta({
            companies: rows,
            groupId: bootGroup,
          });
          if (cancelled) return;
          const procList = bootScope ? await fetchProcesses(null, bootScope) : [];
          setProcesses(procList);
          setPermissions(meta.permissions);
          setActivePermission(meta.activePermission);
          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
          return;
        }
        setCompanyId(initialCompanyId);

        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          const bootScope = resolveCaptureMaintenanceScope({
            companies: rows,
            selectedGroup: bootGroup,
            companyId: initialCompanyId,
          });

          // Fetch initial metadata here to ensure the first query starts with the correct activePermission
          const [procList, companyPerms] = await Promise.all([
            fetchProcesses(initialCompanyId, bootScope),
            fetchCompanyPermissions(code),
          ]);
          if (cancelled) return;

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

          setProcesses(procList);
          setPermissions(companyPerms);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = savedPerm && companyPerms.includes(savedPerm) ? savedPerm : (companyPerms.length > 0 ? companyPerms[0] : "");
          setActivePermission(initialActive);

          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
        }

      } catch (err) {
        console.error("Boot error:", err);
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  // -- Load Meta Data (Processes & Permissions) --
  useEffect(() => {
    if (bootLoading || !captureMaintenanceScopeIsReady(captureScope)) return;

    let cancelled = false;
    (async () => {
      try {
        const anchor =
          companyId == null && selectedGroup
            ? companiesNativeInGroupList(companies, selectedGroup)[0]
            : null;
        const permCode = companyCode || anchor?.company_id || "";
        const [procList, permList] = await Promise.all([
          fetchProcesses(companyId, captureScope),
          permCode ? fetchCompanyPermissions(permCode) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setProcesses(procList);
        if (permList.length > 0) setPermissions(permList);

        const saved = permCode ? localStorage.getItem(`selectedPermission_${permCode}`) : null;
        if (saved && permList.includes(saved)) {
          setActivePermission(saved);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }

        if (captureMaintenanceUsesGroupProcesses(captureScope)) {
          setSelectedProcess((prev) =>
            prev && procList.some((p) => String(p.id) === String(prev)) ? prev : "",
          );
        }
      } catch (err) {
        console.error("Meta data load error:", err);
        notify(t("failedLoadProcesses"), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, captureScope, companyId, companyCode, selectedGroup, companies, notify, t]);

  // -- Search Logic --
  const performSearch = useCallback(
    async (overrides = {}) => {
      const effectiveScope =
        overrides.scope ??
        resolveCaptureMaintenanceScope({
          companies,
          selectedGroup: overrides.selectedGroup ?? selectedGroup,
          companyId: overrides.companyId ?? companyId,
          groupsAllMode,
          groupAllMode,
        });
      if (!captureMaintenanceScopeIsReady(effectiveScope) || !dateFrom || !dateTo) return;

      const searchScopeKey = captureMaintenanceScopeCacheKey(effectiveScope);
      captureAbortRef.current?.abort();
      const ac = new AbortController();
      captureAbortRef.current = ac;
      const seq = ++captureSeqRef.current;
      const quietRefresh = initialCaptureSearchDoneRef.current;
      if (!quietRefresh) setLoading(true);
      else {
        setLoading(false);
        setListSyncing(true);
      }
      setSelectedIds([]);
      try {
        const data = await searchCaptureData(
          {
            dateFrom,
            dateTo,
            process: selectedProcess,
            category: activePermission,
            scope: effectiveScope,
          },
          { signal: ac.signal },
        );
        if (seq !== captureSeqRef.current) return;
        if (searchScopeKey !== scopeKeyRef.current) return;
        setCaptureListEpoch((e) => e + 1);
        setCaptureData(data);
        setCaptureDataSourceCompanyId(captureMaintenanceScopeCacheCompanyKey(effectiveScope));
        if (!quietRefresh) {
          if (data.length > 0) {
            notify(t("foundRecords", { n: data.length }), "success");
          } else {
            notify(t("noDataAdjustSearch"), "info");
          }
        }
      } catch (err) {
        if (err?.name === "AbortError" || seq !== captureSeqRef.current) return;
        if (searchScopeKey !== scopeKeyRef.current) return;
        notify(err.message, "error");
        setCaptureListEpoch((e) => e + 1);
        setCaptureData([]);
        setCaptureDataSourceCompanyId(null);
      } finally {
        initialCaptureSearchDoneRef.current = true;
        if (seq === captureSeqRef.current) {
          setLoading(false);
          setListSyncing(false);
        }
      }
    },
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode, dateFrom, dateTo, selectedProcess, activePermission, notify, t],
  );

  // Auto-search when filters change（defer 0ms；切换公司已手动 performSearch 时跳过一轮避免重复）
  useEffect(() => {
    if (!bootLoading && listQueryEnabled) {
      if (suppressNextSearchEffectRef.current) {
        suppressNextSearchEffectRef.current = false;
        return;
      }
      const h = setTimeout(() => {
        void performSearch();
      }, 0);
      return () => clearTimeout(h);
    }
  }, [
    bootLoading,
    listQueryEnabled,
    captureScopeKey,
    selectedProcess,
    dateFrom,
    dateTo,
    activePermission,
    performSearch,
  ]);

  useEffect(
    () => () => {
      captureAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    scopeKeyRef.current = captureScopeKey;
  }, [captureScopeKey]);

  // -- Handlers --
  const handleClearCompany = useCallback(
    (groupForPersist) => {
      const g = groupForPersist ?? selectedGroup;
      setCompanyId(null);
      setCompanyCode("");
      setSelectedProcess("");
      setSelectedIds([]);
      persistDashboardFilterState(g, null);
    },
    [selectedGroup],
  );

  const onPrepareCompanySelect = useCallback(
    (c) => {
      if (!c?.id) return;
      const nextId = Number(c.id);
      const nextCode = c.company_id || "";
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const nextScope = resolveCaptureMaintenanceScope({
        companies,
        selectedGroup: newGroup,
        companyId: nextId,
        groupsAllMode,
        groupAllMode,
      });
      suppressNextSearchEffectRef.current = true;
      setCompanyId(nextId);
      setCompanyCode(nextCode);
      setSelectedGroup(newGroup);
      persistDashboardFilterState(newGroup, nextId);
      void performSearch({ scope: nextScope });
    },
    [companies, performSearch, groupsAllMode, groupAllMode],
  );

  onPrepareCompanySelectRef.current = onPrepareCompanySelect;

  const handleSwitchCompany = async (c) => {
    if (!c?.id) return;
    const nextCode = c.company_id || "";

    try {
      const sessionData = await updateSessionCompany(c.id);

      if (sessionData && sessionData.has_gambling === false) {
        navigate("/process-list", { replace: true });
        return;
      }

      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: nextCode }), "success");
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("unauthorized permission category")) {
        navigate("/process-list", { replace: true });
        return;
      }
      notify(err.message || t("switchFailed"), "error");
    }
  };

  switchCompanyRef.current = handleSwitchCompany;
  onClearCompanyRef.current = handleClearCompany;

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

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const selectable = captureDataRef.current.filter(
        (row) => !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true),
      );
      if (prev.length === selectable.length && selectable.length > 0) return [];
      return selectable.map((row) => row.capture_id);
    });
  }, []);

  const selectableRowsCount = useMemo(
    () =>
      captureData.filter(
        (row) => !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true),
      ).length,
    [captureData],
  );
  const selectAll = selectedIds.length > 0 && selectedIds.length === selectableRowsCount;

  const handleDeleteClick = () => {
    if (guardWrite()) return;
    if (selectedIds.length === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setShowDeleteModal(true);
  };

  const confirmDeleteAction = async () => {
    if (guardWrite()) return;
    setShowDeleteModal(false);
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
        dateTo,
        scope: captureScope,
      });

      notify(t("deleteSuccessful"), "success");
      setConfirmDelete(false);
      setSelectedIds([]);
      await performSearch();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const tableLoading = loading || bootLoading;

  return (
    <div className="container">
      {permissions.length > 1 ? (
      <div className="maintenance-header">
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
      </div>
      ) : null}

      {/* Scope table CSS: other maintenance pages share .maintenance-* and win in bundle order */}
      <div className="capture-maintenance-page-root">
        <CaptureMaintenanceFilters
          processes={processes}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          today={todayDmy}
          companyId={companyId}
          snapGroupIds={snapGroupIds}
          visibleCompanies={visibleCompanies}
          selectedGroup={selectedGroup}
          onGroupClick={handleGroupClick}
          onPickCompany={handlePickCompany}
          onPickAllGroups={handlePickAllGroups}
          onPickAllInGroup={handlePickAllInGroup}
          groupsAllMode={groupsAllMode}
          groupAllMode={groupAllMode}
          onDelete={handleDeleteClick}
          canDelete={selectedIds.length > 0}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          m={m}
        />

        <div className="capture-maintenance-table-region">
          {listSyncing && (
            <div className="capture-maintenance-sync-track" aria-hidden>
              <div className="capture-maintenance-sync-bar" />
            </div>
          )}
          <CaptureMaintenanceTable
            key={captureDataSourceCompanyId ?? captureScopeKey ?? "no-scope"}
            data={captureData}
            listEpoch={captureListEpoch}
            rowKeyCompanyId={captureDataSourceCompanyId ?? captureScopeKey}
            loading={tableLoading}
            listSyncing={listSyncing}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            selectAll={selectAll}
            m={m}
          />
        </div>
      </div>

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>
      {/* Confirm Modal */}
      <MaintenanceDeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteAction}
        count={selectedIds.length}
        t={t}
      />
    </div>
  );
}
