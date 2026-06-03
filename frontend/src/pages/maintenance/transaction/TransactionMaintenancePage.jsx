import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, isCancelledError } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { canAccessTransactionFormulaMaintenance } from "../../../utils/auth/sidebarPermissions.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import {
  companiesInGroupList,
  getCachedOwnerCompanies,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  readPersistedDashboardGcFilter,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  fetchOwnerCompaniesAll,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import { useMaintenancePageScrollLock } from "../shared/useMaintenancePageScrollLock.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/transaction_maintenance.css";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import {
  fetchCompanyPermissions,
  fetchProcessesForPermission,
  isBankOnlyCategoryCompany,
  normalizeMaintenanceProcessFilter,
  filterTransactionMaintenancePermissions,
  pickTransactionMaintenancePermission,
  searchTransactionData,
  updateSessionCompany,
  isMaintenanceRecoverableError,
  getMaintenanceSearchUserMessage,
  packMaintenanceCache,
  getMaintenanceCacheRows,
  isMaintenanceCacheComplete,
  buildTransactionMaintenanceQueryKey,
  bootstrapTransactionMaintenanceMeta,
} from "./transactionMaintenanceLogic.js";
import {
  resolveTransactionMaintenanceScope,
  transactionMaintenanceScopeCacheKey,
  transactionMaintenanceScopeIsReady,
  transactionMaintenanceUsesGroupProcesses,
} from "./transactionMaintenanceScope.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";

// Components
import TransactionMaintenanceFilters from "./components/TransactionMaintenanceFilters.jsx";
import TransactionMaintenanceTable from "./components/TransactionMaintenanceTable.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

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
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);
  useMaintenancePageScrollLock();

  const [companies, setCompanies] = useState(() => getCachedOwnerCompanies() || []);
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
  /** Boot finished metadata; date picker synced — avoids racing search with boot/meta fetches. */
  const [filtersReady, setFiltersReady] = useState(false);
  const [dateRangeReady, setDateRangeReady] = useState(false);
  const [searchDeferredReady, setSearchDeferredReady] = useState(false);
  /** Meta (process list + permission/category) ready for querying. */
  const [metaReady, setMetaReady] = useState(false);
  const followGroupRef = useRef(() => {});
  const bootRunIdRef = useRef(0);

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

  const visiblePermissions = useMemo(
    () => filterTransactionMaintenancePermissions(permissions),
    [permissions],
  );

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

  const transactionScope = useMemo(
    () =>
      resolveTransactionMaintenanceScope({
        companies,
        selectedGroup,
        companyId,
        groupsAllMode,
        groupAllMode,
      }),
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode],
  );

  const transactionScopeKey = useMemo(
    () => transactionMaintenanceScopeCacheKey(transactionScope),
    [transactionScope],
  );

  const maintenanceQueryKey = useMemo(
    () =>
      buildTransactionMaintenanceQueryKey({
        scope: transactionScope,
        dateFrom,
        dateTo,
        process: processFilter,
        category: activePermission || "",
      }),
    [transactionScope, dateFrom, dateTo, processFilter, activePermission],
  );

  const listQueryEnabled = Boolean(
    filtersReady &&
    dateRangeReady &&
    metaReady &&
    transactionMaintenanceScopeIsReady(transactionScope) &&
    dateFrom &&
    dateTo &&
    activePermission,
  );

  useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
    enabled: true,
  });

  const bootPending =
    !filtersReady ||
    !dateRangeReady ||
    !metaReady ||
    !dateFrom ||
    !dateTo ||
    !activePermission;

  const maintenancePlaceholder = useCallback(
    (previousData, previousQuery) => {
      const cached = queryClient.getQueryData(maintenanceQueryKey);
      const cachedRows = getMaintenanceCacheRows(cached);
      if (cachedRows.length > 0) {
        return packMaintenanceCache(cachedRows, isMaintenanceCacheComplete(cached));
      }
      const prevScopeKey = previousQuery?.queryKey?.[1];
      const prevRows = getMaintenanceCacheRows(previousData);
      if (prevScopeKey === transactionScopeKey && prevRows.length > 0) {
        return packMaintenanceCache(prevRows, isMaintenanceCacheComplete(previousData));
      }
      return undefined;
    },
    [queryClient, maintenanceQueryKey, transactionScopeKey],
  );

  const transactionQuery = useQuery({
    queryKey: maintenanceQueryKey,
    queryFn: async ({ signal }) => {
      const rows = await searchTransactionData({
        dateFrom,
        dateTo,
        process: processFilter,
        category: activePermission,
        scope: transactionScope,
        signal,
        onProgress: (progressRows) => {
          const existing = queryClient.getQueryData(maintenanceQueryKey);
          if (isMaintenanceCacheComplete(existing)) return;
          queryClient.setQueryData(
            maintenanceQueryKey,
            packMaintenanceCache(progressRows, false),
          );
        },
      });
      const packed = packMaintenanceCache(rows, true);
      queryClient.setQueryData(maintenanceQueryKey, packed);
      return packed;
    },
    enabled: listQueryEnabled && searchDeferredReady,
    initialData: () => {
      const cached = queryClient.getQueryData(maintenanceQueryKey);
      if (!isMaintenanceCacheComplete(cached)) return undefined;
      // Do not hydrate empty complete cache — SPA revisit would skip fetch until hard refresh.
      if (getMaintenanceCacheRows(cached).length === 0) return undefined;
      return cached;
    },
    initialDataUpdatedAt: () => {
      const state = queryClient.getQueryState(maintenanceQueryKey);
      return state?.dataUpdatedAt;
    },
    staleTime: (query) => {
      const data = query.state.data;
      if (!isMaintenanceCacheComplete(data)) return 0;
      if (getMaintenanceCacheRows(data).length === 0) return 0;
      return 60 * 60 * 1000;
    },
    gcTime: 60 * 60 * 1000,
    refetchOnMount: (query) => {
      const data = query.state.data;
      if (!data) return true;
      if (getMaintenanceCacheRows(data).length === 0) return true;
      return !isMaintenanceCacheComplete(data);
    },
    refetchOnReconnect: false,
    placeholderData: maintenancePlaceholder,
    retry: (failureCount, error) =>
      error?.name !== "AbortError" && !isCancelledError(error) && failureCount < 5,
    retryDelay: (attempt) => Math.min(2500, 500 * (attempt + 1)),
  });

  const transactionData = getMaintenanceCacheRows(transactionQuery.data);
  const maintenanceDataComplete = isMaintenanceCacheComplete(transactionQuery.data);
  const listRowCount = transactionData.length;
  const searchRecoverable =
    transactionQuery.isError &&
    listRowCount === 0 &&
    isMaintenanceRecoverableError(transactionQuery.error);
  /** 无数据：加载中或可恢复错误 — 显示 Loading，不出现 Search failed */
  const showListSkeleton =
    listRowCount === 0 &&
    (bootPending ||
      !searchDeferredReady ||
      (listQueryEnabled && !transactionQuery.isFetched) ||
      transactionQuery.isLoading ||
      transactionQuery.isFetching ||
      (searchRecoverable && !recoverableExhausted));
  const recoverableRetryRef = useRef(0);
  const [recoverableExhausted, setRecoverableExhausted] = useState(false);
  const lastToastKeyRef = useRef(null);

  const searchQueryKey = useMemo(
    () =>
      JSON.stringify([
        transactionScopeKey,
        dateFrom,
        dateTo,
        processFilter,
        activePermission || "",
      ]),
    [transactionScopeKey, dateFrom, dateTo, processFilter, activePermission],
  );

  useEffect(() => {
    recoverableRetryRef.current = 0;
    setRecoverableExhausted(false);
    lastToastKeyRef.current = null;
  }, [searchQueryKey]);

  useEffect(() => {
    if (!listQueryEnabled || !searchRecoverable || transactionQuery.isFetching) return;
    if (recoverableRetryRef.current >= 10) {
      setRecoverableExhausted(true);
      return;
    }

    const delay = Math.min(4000, 700 * (recoverableRetryRef.current + 1));
    const timer = window.setTimeout(() => {
      recoverableRetryRef.current += 1;
      transactionQuery.refetch({ cancelRefetch: false });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    listQueryEnabled,
    searchRecoverable,
    recoverableExhausted,
    transactionQuery.isFetching,
    transactionQuery.errorUpdatedAt,
    searchQueryKey,
    transactionQuery,
  ]);

  useEffect(() => {
    if (transactionQuery.isSuccess) {
      recoverableRetryRef.current = 0;
      setRecoverableExhausted(false);
    }
  }, [transactionQuery.isSuccess, transactionQuery.dataUpdatedAt]);

  const listStatusMessage = useMemo(() => {
    if (showListSkeleton) return t("searchRetrying");
    if (recoverableExhausted) return t("searchRetryHint");
    if (transactionQuery.isError && listRowCount === 0) {
      return getMaintenanceSearchUserMessage(transactionQuery.error, {
        loadingMessage: t("searchRetrying"),
        narrowRangeMessage: t("searchRetryHint"),
      });
    }
    return "";
  }, [
    showListSkeleton,
    recoverableExhausted,
    transactionQuery.isError,
    transactionQuery.error,
    listRowCount,
    t,
  ]);

  const showNoDataEmpty =
    listQueryEnabled &&
    searchDeferredReady &&
    transactionQuery.isFetched &&
    !transactionQuery.isFetching &&
    listRowCount === 0 &&
    !showListSkeleton &&
    !listStatusMessage;

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

    removeOtherMaintenanceStylesheets("transaction_maintenance.css");
    ensureMaintenanceDateRangePicker();
    return () => {
      document.body.classList.remove("maintenance-page");
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || !me) return;
    setDateRangeReady(true);
  }, [sessionReady, me?.user_id]);

  // Hydrate company from cache before async boot — skip when user cleared company (group-only).
  useEffect(() => {
    const persistedGc = readPersistedDashboardGcFilter();
    if (!me || companyId != null || isDashboardGroupOnlyMode() || persistedGc.groupOnly) return;
    const cached = getCachedOwnerCompanies();
    let initialCompanyId = resolveBootCompanyId({
      sessionCompanyId: me.company_id,
      defaultRowId: cached?.[0]?.id,
    });
    if (
      initialCompanyId &&
      cached?.length &&
      !cached.some((c) => Number(c.id) === initialCompanyId)
    ) {
      initialCompanyId = resolveBootCompanyId({ defaultRowId: cached[0]?.id });
    }
    if (initialCompanyId == null) return;
    const comp = cached?.find((c) => Number(c.id) === initialCompanyId);
    setCompanyId(initialCompanyId);
    if (comp?.company_id) setCompanyCode(comp.company_id);
  }, [me?.user_id, me?.company_id, companyId]);

  // Defer first search one tick after filters are ready (align with Capture/Payment maintenance).
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
    if (!sessionReady || !me) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: m.monthsShort,
    });
  }, [sessionReady, me, lang, t, m]);

  // -- Boot Logic --
  useEffect(() => {
    if (!sessionReady || !me) return;

    const runId = ++bootRunIdRef.current;
    let cancelled = false;
    setFiltersReady(false);
    setMetaReady(false);

    (async () => {
      try {
        const u = me;

        // Member check
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }

        // Permissions check
        if (!canAccessTransactionFormulaMaintenance(u)) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const filtered = await fetchOwnerCompaniesAll();
        if (cancelled) return;
        setCompanies(filtered);

        // Set Initial Company
        let initialCompanyId = resolveBootCompanyId({
          sessionCompanyId: u.company_id,
          defaultRowId: filtered[0]?.id,
        });

        if (
          initialCompanyId &&
          !filtered.some((c) => Number(c.id) === initialCompanyId)
        ) {
          initialCompanyId = resolveBootCompanyId({ defaultRowId: filtered[0]?.id });
        }

        const currentComp =
          initialCompanyId != null
            ? filtered.find((c) => Number(c.id) === initialCompanyId) || null
            : null;
        const bootGroup = resolveInitialSelectedGroupFromSession(filtered, currentComp);
        setSelectedGroup(bootGroup);
        const persistedGc = readPersistedDashboardGcFilter();
        const groupOnlyBoot =
          isDashboardGroupOnlyMode() || persistedGc.groupOnly;

        if (groupOnlyBoot) {
          persistDashboardGroupOnlyMode(true);
          persistDashboardSelectedCompany(null);
          setCompanyId(null);
          setCompanyCode("");
          const bootScope = resolveTransactionMaintenanceScope({
            companies: filtered,
            selectedGroup: bootGroup,
            companyId: null,
          });
          const meta = await bootstrapTransactionMaintenanceMeta({
            companies: filtered,
            groupId: bootGroup,
          });
          if (cancelled) return;
          setPermissions(meta.permissions);
          setActivePermission(meta.activePermission);
          setMetaReady(true);
          try {
            const procList = bootScope
              ? await fetchProcessesForPermission(null, meta.activePermission, bootScope)
              : [];
            if (!cancelled) setProcesses(procList);
          } catch (err) {
            console.error("Process list load error:", err);
          }
          skipMetaAfterBootRef.current = true;
          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
          return;
        }

        if (initialCompanyId != null) {
          setCompanyId(initialCompanyId);
        }

        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          // Fetch permissions first to pick the correct category for downstream APIs.
          const companyPerms = await fetchCompanyPermissions(code);

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

          try {
            await updateSessionCompany(initialCompanyId);
          } catch (err) {
            console.error("Session company sync error:", err);
          }
          if (cancelled) return;

          setPermissions(companyPerms);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = pickTransactionMaintenancePermission(companyPerms, savedPerm);
          setActivePermission(initialActive);
          setMetaReady(true);

          // Process list is a UI nicety; do not block initial list query on this.
          try {
            const bootScope = resolveTransactionMaintenanceScope({
              companies: filtered,
              selectedGroup: bootGroup,
              companyId: initialCompanyId,
            });
            const procList = await fetchProcessesForPermission(
              initialCompanyId,
              initialActive,
              bootScope,
            );
            if (!cancelled) setProcesses(procList);
          } catch (err) {
            console.error("Process list load error:", err);
          }

          // Cache permissions so the meta-effect below skips redundant API call
          switchPermsCacheRef.current = { companyCode: code, perms: companyPerms };
          skipMetaAfterBootRef.current = true;

          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
        }

      } catch (err) {
        console.error("Boot error:", err);
        if (!cancelled && runId === bootRunIdRef.current) navigate("/login", { replace: true });
      } finally {
        if (!cancelled && runId === bootRunIdRef.current) setFiltersReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, navigate, me?.user_id]);

  // -- Load Meta Data (Processes & Permissions) --
  useEffect(() => {
    if (!filtersReady || !transactionMaintenanceScopeIsReady(transactionScope)) return;
    if (skipMetaAfterBootRef.current) {
      skipMetaAfterBootRef.current = false;
      return;
    }

    let cancelled = false;
    const scope = transactionScope;
    const cid = companyId;
    const permCode =
      companyCode ||
      (selectedGroup
        ? companiesInGroupList(companies, selectedGroup)[0]?.company_id
        : "") ||
      "";

    (async () => {
      try {
        setMetaReady(false);
        const cached = switchPermsCacheRef.current;
        let permList;
        if (cached && cached.companyCode === permCode) {
          permList = cached.perms;
          switchPermsCacheRef.current = null;
        } else if (permCode) {
          permList = await fetchCompanyPermissions(permCode);
        } else {
          permList = filterTransactionMaintenancePermissions(["Games", "Gambling", "Bank"]);
        }
        if (cancelled) return;
        setPermissions(permList);

        const nextPerm = pickTransactionMaintenancePermission(
          permList,
          permCode ? localStorage.getItem(`selectedPermission_${permCode}`) : null,
        );
        setActivePermission(nextPerm);
        setMetaReady(true);

        try {
          const procList = await fetchProcessesForPermission(cid, nextPerm, scope);
          if (cancelled) return;
          setProcesses(procList);
          const usesGroup = transactionMaintenanceUsesGroupProcesses(scope);
          setSelectedProcess((prev) => {
            const filter = normalizeMaintenanceProcessFilter(prev);
            if (!filter) return "";
            if (usesGroup) {
              return procList.some((p) => String(p.id) === String(filter)) ? filter : "";
            }
            return procList.some((p) => String(p.process_name) === filter) ? filter : "";
          });
        } catch (err) {
          if (cancelled) return;
          console.error("Process list load error:", err);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Meta data load error:", err);
        notify(t("failedLoadMetaData"), "error");
        setActivePermission((prev) => prev || pickTransactionMaintenancePermission(["Games", "Gambling", "Bank"], null));
        setMetaReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    filtersReady,
    transactionScope,
    companyId,
    companyCode,
    selectedGroup,
    companies,
    notify,
    t,
  ]);

  useEffect(() => {
    if (!transactionQuery.isSuccess || !maintenanceDataComplete || !transactionData.length) return;
    if (transactionQuery.isPlaceholderData) return;
    if (transactionQuery.isFetching) return;
    const key = `${transactionQuery.dataUpdatedAt}:${transactionData.length}`;
    if (lastToastKeyRef.current === key) return;
    lastToastKeyRef.current = key;
    notify(t("foundRecords", { n: transactionData.length }), "success");
  }, [
    transactionQuery.isSuccess,
    transactionQuery.isFetching,
    transactionQuery.dataUpdatedAt,
    transactionQuery.isPlaceholderData,
    maintenanceDataComplete,
    transactionData.length,
    notify,
    t,
  ]);

  useEffect(() => {
    if (!listQueryEnabled) return;
    if (!transactionQuery.isError || !transactionQuery.error) return;
    const msg = getMaintenanceSearchUserMessage(transactionQuery.error, {
      loadingMessage: t("searchRetrying"),
      narrowRangeMessage: t("searchRetryHint"),
    });
    if (!msg || msg === t("searchRetrying")) return;
    notify(msg, "error");
  }, [
    listQueryEnabled,
    transactionQuery.isError,
    transactionQuery.error,
    transactionQuery.errorUpdatedAt,
    notify,
    t,
  ]);

  useEffect(() => {
    if (!listQueryEnabled) return;
    if (!transactionQuery.isSuccess) return;
    if (!transactionQuery.isFetched) return;
    if (transactionQuery.isFetching) return;
    if (transactionData.length > 0) return;
    const key = `${transactionQuery.dataUpdatedAt ?? ""}:empty`;
    if (!consumeNoDataToastDedupeKey(key)) return;
    notify(t("noDataAdjustSearch"), "info");
  }, [
    listQueryEnabled,
    transactionQuery.isSuccess,
    transactionQuery.isFetched,
    transactionQuery.isFetching,
    transactionData.length,
    transactionQuery.dataUpdatedAt,
    notify,
    t,
  ]);

  // -- Handlers --
  const handleClearCompany = useCallback((groupForPersist) => {
    const g = groupForPersist ?? selectedGroup;
    setCompanyId(null);
    setCompanyCode("");
    setSelectedProcess("");
    setProcesses([]);
    void (async () => {
      try {
        const meta = await bootstrapTransactionMaintenanceMeta({
          companies,
          groupId: g,
        });
        setPermissions(meta.permissions);
        setActivePermission(meta.activePermission);
        setMetaReady(true);
      } catch (err) {
        console.error("Meta bootstrap after clear company:", err);
        setMetaReady(true);
      }
    })();
  }, [companies, selectedGroup]);

  const onPrepareCompanySelect = useCallback((c) => {
    if (!c?.id) return;
    const nextCompanyId = Number(c.id);
    const code = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
    switchPermsCacheRef.current = null;
    skipMetaAfterBootRef.current = true;
    setSelectedGroup(newGroup);
    setMetaReady(false);
    setCompanyCode(code);
    setCompanyId(nextCompanyId);
    setSelectedProcess("");
    persistDashboardFilterState(newGroup, nextCompanyId);
  }, []);

  onPrepareCompanySelectRef.current = onPrepareCompanySelect;

  const handleSwitchCompany = useCallback(async (c) => {
    if (!c?.id) return;
    const nextCompanyId = Number(c.id);
    const code = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;

    const savedPerm = localStorage.getItem(`selectedPermission_${code}`);

    try {
      const res = await updateSessionCompany(c.id);

      if (res.has_gambling === false) {
        navigate("/process-list", { replace: true });
        return;
      }

      const perms = await fetchCompanyPermissions(code);

      if (isBankOnlyCategoryCompany(perms)) {
        navigate("/process-list", { replace: true });
        return;
      }

      const nextActive = pickTransactionMaintenancePermission(perms, savedPerm);
      switchPermsCacheRef.current = { companyCode: code, perms };
      setActivePermission(nextActive);
      setPermissions(perms);
      setMetaReady(true);

      try {
        const nextScope = resolveTransactionMaintenanceScope({
          companies,
          selectedGroup: newGroup,
          companyId: nextCompanyId,
        });
        const procList = await fetchProcessesForPermission(nextCompanyId, nextActive, nextScope);
        setProcesses(procList);
        setSelectedProcess("");
      } catch (err) {
        console.error("Process list load error:", err);
      }

      followGroupRef.current();

      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: c.company_id }), "success");
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("unauthorized permission category")) {
        navigate("/process-list", { replace: true });
        return;
      }
      notify(err.message || t("switchFailed"), "error");
    }
  }, [companies, navigate, notify, t]);

  switchCompanyRef.current = handleSwitchCompany;
  onClearCompanyRef.current = handleClearCompany;

  followGroupRef.current = () => {};

  const handlePermissionSwitch = (p) => {
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
  };

  const listSyncing =
    transactionQuery.isFetching &&
    (transactionQuery.isPlaceholderData || listRowCount > 0 || !maintenanceDataComplete);
  const showTopLoadingBar =
    transactionQuery.isFetching &&
    (showListSkeleton || transactionQuery.isPlaceholderData || listSyncing);

  return (
    <div className="container">
      {visiblePermissions.length > 1 ? (
      <div className="maintenance-header">
          <div id="maintenance-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">{m.category}</span>
            <div id="maintenance-permission-buttons" className="maintenance-company-buttons">
              {visiblePermissions.map(p => (
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

      <div className="transaction-maintenance-page-root">
        <TransactionMaintenanceFilters 
          processes={processes}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
          processValueMode={
            transactionMaintenanceUsesGroupProcesses(transactionScope) ? "id" : "processName"
          }
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          today={todayDmy}
          companyId={companyId}
          companies={companies}
          snapGroupIds={snapGroupIds}
          visibleCompanies={visibleCompanies}
          selectedGroup={selectedGroup}
          onGroupClick={handleGroupClick}
          onPickCompany={handlePickCompany}
          onPickAllGroups={handlePickAllGroups}
          onPickAllInGroup={handlePickAllInGroup}
          groupsAllMode={groupsAllMode}
          groupAllMode={groupAllMode}
          onClearCompany={handleClearCompany}
          allowClearCompany={allowClearCompany}
          m={m}
        />

        <TransactionMaintenanceTable
          data={transactionData}
          showSkeleton={showListSkeleton && !listSyncing}
          showEmptyState={showNoDataEmpty}
          statusMessage={listStatusMessage}
          showTopLoading={showTopLoadingBar}
          topLoadingLabel={listStatusMessage || t("loading")}
          isPlaceholderData={transactionQuery.isPlaceholderData || listSyncing}
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
