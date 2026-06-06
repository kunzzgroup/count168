import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import {
  buildDashboardCacheKey,
  getDashboardCache,
  getDashboardPayloadCache,
  patchDashboardCache,
  setDashboardCache,
  setDashboardPayloadCache,
} from "../../../utils/dashboard/dashboardCache.js";
import { mergeGroupData } from "../../../utils/dashboard/dashboardMerge.js";
import {
  convertToBaseAmount,
  fetchFrankfurterRates,
  peekFrankfurterRatesCache,
  resolveFrankfurterDate,
  sumConvertedEarnings,
  sumConvertedKpiMetrics,
} from "../../../utils/dashboard/frankfurterRates.js";
import { DASHBOARD_API, DASHBOARD_BOOTSTRAP_API, DASHBOARD_PROFIT_COLOR } from "../lib/dashboardConstants.js";
import {
  buildChartRows,
  makeDashboardChartXTick,
  resolveDailyChartXAxisTicks,
} from "../lib/dashboardChart.jsx";
import {
  chartMonthSpan,
  formatDisplayDate,
  parseYmd,
  previousMonthEquivalentRange,
  shouldAggregateChartByMonth,
} from "../lib/dashboardDateUtils.js";
import { formatI18nTemplate } from "../lib/dashboardFormat.js";
import { buildKpiCompare, computeKpiMetrics } from "../lib/dashboardKpi.js";
import {
  canUseGroupOnlyMode,
  companyLoginRequiresSubsidiaryWithGroup,
  resolveVisibleGroupIds,
} from "../../../utils/company/loginScope.js";
import { sortIds } from "../lib/dashboardEarnings.js";
import {
  companiesInGroupList,
  companiesNativeInGroupList,
  companiesForCompanyPicker,
  companyRowIsGroupEntity,
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  pickDefaultCompanyForGroup,
  pickGroupAnchorCompany,
  notifyDashboardGroupFilterChanged,
  clearDashboardGroupFilterKeepCompany,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  resolveCrossPageCurrencyPreference,
  buildDashboardCurrencyScopeKey,
  applyLoginScopeToSessionStorageIfNeeded,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  filterCompaniesForLoginScope,
  sortedUniqueGroupIds,
  isVirtualGroupLinkCompanyRow,
  fetchOwnerCompaniesAll,
  fetchOwnerGroupsAll,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyWhenClosingGroup,
  resolveCompanyWhenPickingAllGroups,
  resolveCompanyPickWhenSwitchingGroup,
  independentCompaniesForPicker,
  allGroupedCompaniesForPicker,
  resolveGroupAllMergeCompanyList,
  resolveGroupsAllMergeCompanyList,
  isSubsidiaryCompanyRow,
  companyRowIsIndependent,
  normalizeNativeCompanyGroupId,
  normalizeCompanyGroupId,
  persistDashboardGroupOnlyMode,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  persistDashboardGroupFilter,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";
import { useCrossPageCurrencySync } from "../../../utils/company/useCrossPageCurrencySync.js";
import { saveUserCurrencyOrder } from "../../transaction/lib/transactionApi.js";

/** Per-company view_group for API access (linked companies under AP/IG, etc.). */
function resolveViewGroupForCompany(companyRow, fallbackGroup = null) {
  if (!companyRow) {
    return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
  }
  const link = companyRow.link_source_group
    ? String(companyRow.link_source_group).trim().toUpperCase()
    : "";
  if (link) return link;
  const native = companyRow.group_id
    ? String(companyRow.group_id).trim().toUpperCase()
    : "";
  if (native) return native;
  return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
}

/** Query params for group-only dashboard currency (matches loadCurrencies group-only branch). */
function buildGroupOnlyScopeCurrencyQuery(companies, groupKey) {
  const g = String(groupKey).trim().toUpperCase();
  const anchor = pickGroupAnchorCompany(companies, g);
  const anchorId = anchor?.id != null ? parseInt(anchor.id, 10) : null;
  const q = new URLSearchParams();
  if (anchorId) {
    q.set("company_id", String(anchorId));
    q.set("view_group", g);
    q.set("group_id", g);
    q.set("group_aggregate", "1");
  } else {
    q.set("group_id", g);
    q.set("view_group", g);
  }
  return q;
}

export function useDashboardPage({ i18n, dateFrom, dateTo }) {
  const { me, sessionReady } = useAuthSession();
  const [loadError, setLoadError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [mergedSubsetIds, setMergedSubsetIds] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [multiCurrencyKpi, setMultiCurrencyKpi] = useState(null);
  const [multiCurrencyKpiPrev, setMultiCurrencyKpiPrev] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardDataPrev, setDashboardDataPrev] = useState(null);
  const [loading, setLoading] = useState(true);
  const [earningsByCurrency, setEarningsByCurrency] = useState([]);
  const [earningsByCurrencyPrev, setEarningsByCurrencyPrev] = useState([]);
  const [earningsByCurrencyLoading, setEarningsByCurrencyLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({ rates: {}, date: null, unsupported: [] });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState("");
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);
  const [companyAccessModal, setCompanyAccessModal] = useState({ open: false, message: "" });
  /** Matches `dashboardScopeKey` when `dashboardData` reflects the active filter scope. */
  const [displayScopeKey, setDisplayScopeKey] = useState("");

  const currencyCodeRef = useRef(currencyCode);
  const earningsFetchGenRef = useRef(0);
  const dashboardFetchGenRef = useRef(0);
  const dashboardDataRef = useRef(null);
  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);
  const companySwitchGenRef = useRef(0);
  const currencyLoadGenRef = useRef(0);
  const skipNextCurrencyClickRef = useRef(false);
  const scopeCurrencyKeyRef = useRef("");
  const bootstrapGcOnceRef = useRef(false);
  const [groupFilterOptOutTick, setGroupFilterOptOutTick] = useState(0);
  /** @type {React.MutableRefObject<Map<number, string[]>>} */
  const currenciesByCompanyRef = useRef(new Map());
  /** @type {React.MutableRefObject<Map<string, string[]>>} */
  const currenciesByGroupRef = useRef(new Map());

  const buildScopeCurrencyKey = useCallback(
    () =>
      [
        selectedGroup || "",
        companyId ?? "",
        groupsAllMode ? "1" : "0",
        groupAllMode ? "1" : "0",
        mergedSubsetIds?.join(",") ?? "",
      ].join("|"),
    [selectedGroup, companyId, groupsAllMode, groupAllMode, mergedSubsetIds]
  );

  const groupOnlyDashboard = Boolean(
    !companyId &&
      selectedGroup &&
      !groupsAllMode &&
      !groupAllMode &&
      me &&
      canUseGroupOnlyMode(me)
  );

  /**
   * Group-level KPI (AP/IG): group ledger API or group-entity row only — never merge subsidiaries (e.g. C168).
   * Company "All" (groupAllMode) aggregates subsidiaries via merge, not group ledger.
   */
  const usesGroupLedgerDashboard = useMemo(() => {
    if (groupsAllMode && !groupAllMode) return false;
    if (groupAllMode) return false;
    if (!selectedGroup) return false;
    if (!companyId) return true;
    const row = companies.find((c) => parseInt(c.id, 10) === parseInt(companyId, 10));
    return companyRowIsGroupEntity(row, selectedGroup);
  }, [groupsAllMode, groupAllMode, selectedGroup, companyId, companies]);

  /** Subsidiary drill-down under a group tab (e.g. C168 under AP) — isolate from group-ledger data. */
  const subsidiaryDashboardScope = useMemo(() => {
    if (companyId == null || groupsAllMode || groupAllMode || !selectedGroup) return false;
    return !usesGroupLedgerDashboard;
  }, [companyId, selectedGroup, groupsAllMode, groupAllMode, usesGroupLedgerDashboard]);

  const groupsAllGroupLevel = groupsAllMode && companyId == null && !groupAllMode;
  const groupAggregateMode =
    groupAllMode || groupOnlyDashboard || groupsAllGroupLevel || usesGroupLedgerDashboard;
  /** All-currency merge: any scope with 2+ currencies (single company or group aggregate). */
  const canShowAllCurrencies = currencies.length > 1;
  const conversionBaseCurrency =
    (currencyCode && currencies.includes(currencyCode) ? currencyCode : currencies[0]) || "";

  const resolveDashboardScopeKey = useCallback(
    (overrides = {}) => {
      const cid = overrides.companyId !== undefined ? overrides.companyId : companyId;
      const selGroup =
        overrides.selectedGroup !== undefined ? overrides.selectedGroup : selectedGroup;
      const gAll = overrides.groupsAllMode !== undefined ? overrides.groupsAllMode : groupsAllMode;
      const gaMode = overrides.groupAllMode !== undefined ? overrides.groupAllMode : groupAllMode;
      const subset =
        overrides.mergedSubsetIds !== undefined ? overrides.mergedSubsetIds : mergedSubsetIds;
      const cur = overrides.currencyCode !== undefined ? overrides.currencyCode : currencyCode;
      const from = overrides.dateFrom ?? dateFrom;
      const to = overrides.dateTo ?? dateTo;
      const showAll =
        overrides.showAllCurrencies !== undefined ? overrides.showAllCurrencies : showAllCurrencies;
      const allCurActive = showAll && canShowAllCurrencies;
      const convBase = overrides.conversionBaseCurrency ?? conversionBaseCurrency;

      let scopeCompanyKey = cid ?? null;
      const usesLedger = (() => {
        if (gAll && !gaMode) return false;
        if (gaMode) return false;
        if (!selGroup) return false;
        if (cid == null) return true;
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        return companyRowIsGroupEntity(row, selGroup);
      })();
      const subScope = cid != null && !gAll && !gaMode && selGroup && !usesLedger;

      if (subScope && scopeCompanyKey != null) {
        scopeCompanyKey = `sub:${scopeCompanyKey}`;
      }
      if (scopeCompanyKey == null && usesLedger && selGroup) {
        scopeCompanyKey = `group:${selGroup}`;
      }
      if (scopeCompanyKey == null && gAll) {
        scopeCompanyKey = "groups:all";
      }
      if (scopeCompanyKey == null && gaMode && selGroup) {
        scopeCompanyKey = `groupAll:${selGroup}`;
      }
      if (scopeCompanyKey == null && subset?.length > 1) {
        scopeCompanyKey = `subset:${subset.join(",")}`;
      }
      if (!scopeCompanyKey) return "";

      return buildDashboardCacheKey({
        companyId: scopeCompanyKey,
        dateFrom: from,
        dateTo: to,
        currencyCode: cur,
        selectedGroup: selGroup,
        groupsAllMode: gAll,
        groupAllMode: gaMode,
        mergedSubsetIds: subset,
        showAllCurrencies: allCurActive,
        conversionBaseCurrency: convBase,
      });
    },
    [
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      dateFrom,
      dateTo,
      currencyCode,
      showAllCurrencies,
      canShowAllCurrencies,
      conversionBaseCurrency,
      companies,
    ]
  );

  const dashboardScopeKey = useMemo(() => resolveDashboardScopeKey(), [resolveDashboardScopeKey]);

  const primeDashboardFromCache = useCallback(
    (overrides = {}) => {
      const key = resolveDashboardScopeKey(overrides);
      if (!key) {
        setDisplayScopeKey("");
        setDashboardData(null);
        setDashboardDataPrev(null);
        setLoading(true);
        return false;
      }
      const cached = getDashboardCache(key);
      if (!cached?.current) {
        setDisplayScopeKey("");
        setDashboardData(null);
        setDashboardDataPrev(null);
        setLoading(true);
        return false;
      }
      setDashboardData(cached.current);
      setDashboardDataPrev(cached.previous ?? null);
      setDisplayScopeKey(key);
      setLoading(false);
      if (cached.multiCurrencyKpi) setMultiCurrencyKpi(cached.multiCurrencyKpi);
      else setMultiCurrencyKpi(null);
      if (cached.multiCurrencyKpiPrev) setMultiCurrencyKpiPrev(cached.multiCurrencyKpiPrev);
      else setMultiCurrencyKpiPrev(null);
      if (cached.earnings?.length) {
        setEarningsByCurrency(cached.earnings);
        setEarningsByCurrencyPrev([]);
        setEarningsByCurrencyLoading(false);
      } else {
        setEarningsByCurrency([]);
        setEarningsByCurrencyPrev([]);
        setEarningsByCurrencyLoading(currencies.length > 1);
      }
      return true;
    },
    [resolveDashboardScopeKey, currencies.length]
  );

  useLayoutEffect(() => {
    document.body.classList.add("transaction-page");
    return () => document.body.classList.remove("transaction-page");
  }, []);

  const bootstrap = useCallback(async (signal) => {
    setLoadError("");
    if (!sessionReady || !me) return;
    try {
      const u = me;

      const cjRows = await fetchOwnerCompaniesAll({ signal, throwOnError: true });
      void fetchOwnerGroupsAll(u, { signal });
      const scopedCompanies = filterCompaniesForLoginScope(cjRows, u);
      setCompanies(scopedCompanies);
      applyLoginScopeToSessionStorageIfNeeded(u, scopedCompanies);

      const fallbackId =
        scopedCompanies.length === 1
          ? parseInt(scopedCompanies[0].id, 10)
          : u.company_id
            ? parseInt(u.company_id, 10)
            : null;
      let cid = resolveBootCompanyId({ sessionCompanyId: fallbackId, defaultRowId: scopedCompanies[0]?.id });
      if (cid && !scopedCompanies.some((c) => parseInt(c.id, 10) === parseInt(cid, 10))) {
        cid = resolveBootCompanyId({ defaultRowId: parseInt(scopedCompanies[0].id, 10) });
      }

      if (bootstrapGcOnceRef.current) return;

      const groupFilterOptOut =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
      const current =
        cid != null ? scopedCompanies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10)) : null;
      const group = groupFilterOptOut
        ? null
        : resolveInitialSelectedGroupFromSession(scopedCompanies, current, u);
      setSelectedGroup(group);

      if (!groupFilterOptOut && isDashboardGroupOnlyMode() && canUseGroupOnlyMode(u)) {
        setCompanyId(null);
        setDashboardData(null);
        setDashboardDataPrev(null);
        setDisplayScopeKey("");
        setLoading(false);
        bootstrapGcOnceRef.current = true;
        return;
      }

      if (!groupFilterOptOut && isDashboardGroupOnlyMode() && !canUseGroupOnlyMode(u)) {
        persistDashboardFilterState(group, cid, { allowGroupOnly: false });
      }

      let bootCid = cid != null ? parseInt(cid, 10) : null;
      if (groupFilterOptOut && bootCid == null) {
        const pick = resolveCompanyWhenClosingGroup(scopedCompanies, null, sortedUniqueGroupIds(scopedCompanies));
        if (pick?.id) bootCid = parseInt(pick.id, 10);
      }
      if (!groupFilterOptOut && bootCid == null && group) {
        const pick = pickDefaultCompanyForGroup(scopedCompanies, group, { me: u });
        if (pick?.id) bootCid = parseInt(pick.id, 10);
      }
      setCompanyId(bootCid);
      if (bootCid != null) persistDashboardFilterState(group, bootCid, { allowGroupOnly: false });
      if (bootCid == null) setLoading(false);
      bootstrapGcOnceRef.current = true;
    } catch (err) {
      if (err?.name === "AbortError") return;
      setLoadError(err?.message || i18n.failedToLoadDashboard);
      setLoading(false);
    }
  }, [sessionReady, me, i18n.failedToLoadDashboard]);

  useEffect(() => {
    if (!sessionReady || !me) return undefined;
    const controller = new AbortController();
    bootstrap(controller.signal);
    return () => controller.abort();
  }, [bootstrap, sessionReady, me]);

  const { resetAnchorSessionRef } = useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
  });

  /** Keep sidebar (menu, expiry, flags) in sync when dashboard Group / Company filter changes. */
  useLayoutEffect(() => {
    if (!sessionReady || !bootstrapGcOnceRef.current) return;
    const groupOnly = isDashboardGroupOnlyMode();
    const cid = groupOnly ? null : companyId;
    const row =
      cid != null
        ? companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10))
        : null;
    const notifyOpts = groupOnly ? {} : { ignoreGroupOnly: true };
    if (row?.company_id) notifyOpts.companyCode = row.company_id;
    if (row) notifyOpts.expirationDate = row.expiration_date ?? null;
    if (cid != null) {
      const cached = peekCompanySessionFlags(Number(cid));
      if (cached) {
        notifyOpts.hasGambling = Boolean(cached.has_gambling);
        notifyOpts.hasBank = Boolean(cached.has_bank);
      }
    }
    notifyDashboardGroupFilterChanged(selectedGroup, cid, notifyOpts);
  }, [selectedGroup, companyId, companies, sessionReady, groupFilterOptOutTick, groupsAllMode]);

  const groupIds = useMemo(
    () => resolveVisibleGroupIds(sortedUniqueGroupIds(companies), me, companies),
    [companies, me]
  );

  const companiesForPicker = useMemo(() => {
    const preferredId = companyId ?? me?.company_id ?? null;
    const groupFilterOptOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
    if (groupsAllMode) {
      return dedupeOwnerCompaniesByCode(
        allGroupedCompaniesForPicker(companies, groupIds),
        preferredId
      );
    }
    if (selectedGroup && !groupFilterOptOut) {
      return dedupeOwnerCompaniesByCode(
        companiesForCompanyPicker(companies, selectedGroup, groupIds),
        preferredId
      );
    }
    // Group closed: show independent companies only (group subsidiaries collapsed).
    return dedupeOwnerCompaniesByCode(
      independentCompaniesForPicker(companies, groupIds),
      preferredId
    );
  }, [companies, selectedGroup, groupsAllMode, groupIds, companyId, me?.company_id, groupFilterOptOutTick]);

  const resolveMergeCompanyList = useCallback(() => {
    if (groupsAllMode) return resolveGroupsAllMergeCompanyList(companies, groupIds);
    if (selectedGroup) return resolveGroupAllMergeCompanyList(companies, selectedGroup, groupIds);
    return [];
  }, [companies, selectedGroup, groupsAllMode, groupIds]);

  const applyCompanySelection = useCallback((id, options = {}) => {
    const clearSubset = options.clearSubset !== false;
    const clearGroupAll = options.clearGroupAll !== false;
    setCompanyId(parseInt(id, 10));
    if (clearGroupAll) setGroupAllMode(false);
    if (clearSubset) setMergedSubsetIds(null);
  }, []);

  const clearCompanySelection = useCallback((groupForPersist) => {
    const g =
      groupForPersist ??
      selectedGroup ??
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("dashboard_group_filter")
        : null);
    persistDashboardFilterState(g, null);
    setCompanyId(null);
    setGroupAllMode(false);
    setMergedSubsetIds(null);
    setDashboardData(null);
    setDashboardDataPrev(null);
    setDisplayScopeKey("");
    setEarningsByCurrency([]);
    setEarningsByCurrencyLoading(false);
    setShowAllCurrencies(false);
    setMultiCurrencyKpi(null);
    setMultiCurrencyKpiPrev(null);
    setLoading(false);
    setLoadError("");
  }, [selectedGroup]);

  const syncCompanySession = useCallback(
    async (id, viewGroup = selectedGroup, syncGen = null) => {
      const gen = syncGen ?? ++companySwitchGenRef.current;
      try {
        const q = new URLSearchParams({ company_id: String(id) });
        const vg = viewGroup ? String(viewGroup).trim() : "";
        if (vg) q.set("view_group", vg);
        const res = await fetch(
          buildApiUrl(`api/session/update_company_session_api.php?${q.toString()}`),
          {
            credentials: "include",
          }
        );
        const j = await res.json();
        if (gen !== companySwitchGenRef.current) return false;
        if (!res.ok || !j.success) {
          const reason = String(j?.data?.reason || "").toLowerCase();
          const msg = String(j?.message || j?.error || "");
          const lower = msg.toLowerCase();
          const shouldShowModal =
            reason === "expired" ||
            reason === "no_set" ||
            lower.includes("company has expired") ||
            lower.includes("group has expired") ||
            lower.includes("company expiration date is not set") ||
            lower.includes("date is not set");
          if (shouldShowModal) {
            const modalMessage =
              reason === "expired"
                ? "This company since login has expired. Please contact the Customer Service."
                : reason === "no_set"
                  ? "Please contact the Customer Service to set the expiration date."
                  : lower.includes("not set")
                    ? "Please contact the Customer Service to set the expiration date."
                    : "This company since login has expired. Please contact the Customer Service.";
            setCompanyAccessModal({ open: true, message: modalMessage });
            setLoadError(modalMessage);
          } else {
            setLoadError(j.message || j.error || i18n.couldNotSwitchCompany);
          }
          return false;
        }
        if (gen !== companySwitchGenRef.current) return false;
        if (typeof window.updateSidebarDataCaptureVisibility === "function" && j?.data) {
          window.updateSidebarDataCaptureVisibility(j.data.has_gambling, j.data.has_bank);
        }
        if (j?.data) {
          notifyCompanySessionUpdated(j?.data ?? null);
        }
        return true;
      } catch {
        setLoadError(i18n.couldNotSwitchCompany);
        return false;
      }
    },
    [i18n.couldNotSwitchCompany, selectedGroup]
  );

  const applyCurrencyCodes = useCallback((codes, cid) => {
    if (!codes.length) return;
    setCurrencies(codes);
    const scopeKey = buildDashboardCurrencyScopeKey({
      companyId: cid ?? companyId,
      selectedGroup,
    });
    const persisted = resolveCrossPageCurrencyPreference({
      scopeKey,
      availableCodes: codes,
    });
    setCurrencyCode((prev) => {
      if (persisted && codes.includes(persisted)) return persisted;
      if (cid != null && !selectedGroup) return codes[0] || "";
      return prev && codes.includes(prev) ? prev : codes[0] || "";
    });
    if (cid != null && codes.length) currenciesByCompanyRef.current.set(cid, codes);
  }, [companyId, selectedGroup]);

  /** Instant currency pills when switching group/company — uses in-memory cache from prior visits. */
  const primeCurrenciesFromCache = useCallback(
    (scope = {}) => {
      const cid = scope.companyId !== undefined ? scope.companyId : companyId;
      const group = scope.selectedGroup !== undefined ? scope.selectedGroup : selectedGroup;
      const gAll = scope.groupsAllMode !== undefined ? scope.groupsAllMode : groupsAllMode;
      const singleCid =
        cid != null && cid !== "" ? parseInt(cid, 10) : Number.NaN;
      const groupKey = group ? String(group).trim().toUpperCase() : null;
      const isCompanyOnlyScope =
        Number.isFinite(singleCid) &&
        singleCid > 0 &&
        !groupKey &&
        !gAll &&
        !(scope.groupAllMode ?? groupAllMode);
      const clearOnMiss =
        scope.clearOnMiss !== undefined ? scope.clearOnMiss : isCompanyOnlyScope;

      let cached = null;
      if (Number.isFinite(singleCid) && singleCid > 0) {
        cached = currenciesByCompanyRef.current.get(singleCid) ?? null;
      }
      if (!cached?.length && groupKey && !isCompanyOnlyScope) {
        cached = currenciesByGroupRef.current.get(groupKey) ?? null;
      }
      if (!cached?.length && groupKey && !isCompanyOnlyScope && companies?.length) {
        const merged = new Set();
        for (const row of companiesNativeInGroupList(companies, groupKey)) {
          const rowCid = parseInt(row.id, 10);
          if (!Number.isFinite(rowCid) || rowCid <= 0) continue;
          const cc = currenciesByCompanyRef.current.get(rowCid);
          if (cc?.length) cc.forEach((c) => merged.add(c));
        }
        if (merged.size) cached = [...merged];
      }
      if (!cached?.length && gAll) {
        cached = currenciesByGroupRef.current.get("GROUPS:ALL") ?? null;
      }
      if (!cached?.length) {
        if (clearOnMiss) {
          setCurrencies([]);
          setCurrencyCode("");
        }
        return false;
      }

      const list = [...cached];
      setCurrencies(list);
      const scopeKey = buildDashboardCurrencyScopeKey({
        companyId: Number.isFinite(singleCid) && singleCid > 0 ? singleCid : null,
        selectedGroup: groupKey,
      });
      const persisted = resolveCrossPageCurrencyPreference({
        scopeKey,
        availableCodes: list,
      });
      setCurrencyCode((prev) => {
        if (persisted && list.includes(persisted)) return persisted;
        if (isCompanyOnlyScope) return list[0] || "";
        if (prev && list.includes(prev)) return prev;
        return list[0] || "";
      });
      return true;
    },
    [companyId, selectedGroup, groupsAllMode, groupAllMode, companies]
  );

  const orderCurrencyCodes = useCallback((codes, order) => {
    if (!Array.isArray(order) || !order.length) return codes;
    const set = new Set(codes);
    const ordered = [...order.map((c) => String(c).toUpperCase()).filter((c) => set.has(c))];
    const rest = codes.filter((c) => !ordered.includes(c));
    return [...ordered, ...rest];
  }, []);

  const loadCurrencies = useCallback(async () => {
    const scopeKey = buildScopeCurrencyKey();
    scopeCurrencyKeyRef.current = scopeKey;
    const gen = ++currencyLoadGenRef.current;
    const singleCid = companyId != null ? parseInt(companyId, 10) : null;
    const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
    const singleCompanyScope =
      Number.isFinite(singleCid) &&
      singleCid > 0 &&
      !groupKey &&
      !groupsAllMode &&
      !groupAllMode &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1);
    const useGroupAccCurrency = Boolean(groupKey) || groupsAllMode || singleCompanyScope;

    const commitCurrencyList = (codes) => {
      if (gen !== currencyLoadGenRef.current) return;
      if (scopeCurrencyKeyRef.current !== scopeKey) return;
      const list = [...new Set(codes.map((c) => String(c).toUpperCase()).filter(Boolean))];
      setCurrencies(list);
      const persisted = resolveCrossPageCurrencyPreference({
        scopeKey: buildDashboardCurrencyScopeKey({ companyId, selectedGroup }),
        availableCodes: list,
      });
      setCurrencyCode((prev) => {
        if (persisted && list.includes(persisted)) return persisted;
        const companyOnly =
          singleCid &&
          !groupKey &&
          !groupsAllMode &&
          !groupAllMode &&
          !(mergedSubsetIds && mergedSubsetIds.length > 1);
        if (companyOnly) return list[0] || "";
        return prev && list.includes(prev) ? prev : list[0] || "";
      });
      if (singleCid && list.length) {
        currenciesByCompanyRef.current.set(singleCid, list);
      } else if (groupKey && list.length) {
        currenciesByGroupRef.current.set(groupKey, list);
      } else if (groupsAllMode && list.length) {
        currenciesByGroupRef.current.set("GROUPS:ALL", list);
      }
    };

    let companyIds = [];
    let groupLedgerOnly = false;
    /** Group-only currency: entity / group-ledger acc currency — never all subsidiaries. */
    let groupOnlyCurrencyScope = false;
    if (groupsAllMode) {
      if (singleCid) {
        companyIds = [singleCid];
      } else if (groupAllMode) {
        if (selectedGroup) {
          groupOnlyCurrencyScope = true;
          const anchor = pickGroupAnchorCompany(companies, selectedGroup);
          const anchorId = anchor?.id != null ? parseInt(anchor.id, 10) : null;
          if (anchorId) companyIds = [anchorId];
          else groupLedgerOnly = true;
        } else {
          // GroupID=All + Company=All: currencies should reflect AP+IG subsidiaries only (exclude independents).
          companyIds = resolveGroupsAllMergeCompanyList(companies, groupIds)
            .map((c) => parseInt(c.id, 10))
            .filter((id) => Number.isFinite(id));
        }
      } else {
        const ids = new Set();
        for (const gid of groupIds) {
          for (const c of companiesNativeInGroupList(companies, gid)) {
            const n = parseInt(c.id, 10);
            if (Number.isFinite(n)) ids.add(n);
          }
        }
        companyIds = [...ids];
      }
    } else if (groupAllMode && groupKey) {
      groupOnlyCurrencyScope = true;
      const anchor = pickGroupAnchorCompany(companies, groupKey);
      const anchorId = anchor?.id != null ? parseInt(anchor.id, 10) : null;
      if (anchorId) {
        companyIds = [anchorId];
      } else {
        groupLedgerOnly = true;
      }
    } else if (mergedSubsetIds && mergedSubsetIds.length > 1) {
      companyIds = mergedSubsetIds.filter((id) => Number.isFinite(id));
    } else if (singleCid) {
      companyIds = [singleCid];
    } else if (groupKey && !singleCid) {
      groupOnlyCurrencyScope = true;
      const anchor = pickGroupAnchorCompany(companies, groupKey);
      const anchorId = anchor?.id != null ? parseInt(anchor.id, 10) : null;
      if (anchorId) {
        companyIds = [anchorId];
      } else {
        groupLedgerOnly = true;
      }
    }

    const groupPlusCompanyCurrency =
      Boolean(groupKey) && singleCid != null && !groupOnlyCurrencyScope && !subsidiaryDashboardScope;

    if (!companyIds.length && !groupLedgerOnly && !groupOnlyCurrencyScope) {
      commitCurrencyList([]);
      return;
    }

    try {
      let codes = [];
      if (useGroupAccCurrency) {
        const q = new URLSearchParams();
        if (subsidiaryDashboardScope && singleCid) {
          q.set("company_id", String(singleCid));
          q.set("subsidiary_accounts_only", "1");
        } else if (groupLedgerOnly && groupKey) {
          q.set("group_id", groupKey);
          q.set("view_group", groupKey);
        } else {
          if (singleCid) q.set("company_id", String(singleCid));
          else if (companyIds.length && !groupOnlyCurrencyScope) {
            q.set("company_ids", companyIds.join(","));
          }
          if (groupKey) {
            q.set("view_group", groupKey);
            q.set("group_id", groupKey);
          }
          if (groupOnlyCurrencyScope) q.set("group_aggregate", "1");
          if (groupPlusCompanyCurrency) q.set("subsidiary_accounts_only", "1");
        }
        const orderCompanyId =
          groupOnlyCurrencyScope && groupKey
            ? pickGroupAnchorCompany(companies, groupKey)?.id
            : singleCid ?? companyIds[0];
        const ordParams = new URLSearchParams({ _t: String(Date.now()) });
        if (orderCompanyId) ordParams.set("company_id", String(orderCompanyId));

        const [curRes, ordRes] = await Promise.all([
          fetch(
            buildApiUrl(`api/transactions/get_scope_account_currencies_api.php?${q.toString()}`),
            { credentials: "include" }
          ),
          orderCompanyId
            ? fetch(
                buildApiUrl(`api/transactions/user_currency_order_api.php?${ordParams.toString()}`),
                { credentials: "include" }
              ).catch(() => null)
            : Promise.resolve(null),
        ]);
        const curJson = await curRes.json();
        if (curRes.ok && curJson.success && Array.isArray(curJson.data)) {
          codes = curJson.data.map((r) => String(r.code).toUpperCase());
        }
        if (!codes.length && singleCid) {
          const cached = currenciesByCompanyRef.current.get(singleCid);
          if (cached?.length) codes = [...cached];
        } else if (!codes.length && groupKey && !subsidiaryDashboardScope) {
          const cached = currenciesByGroupRef.current.get(groupKey);
          if (cached?.length) codes = [...cached];
        }
        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

        if (ordRes) {
          const ordJson = await ordRes.json();
          codes = orderCurrencyCodes(codes, ordJson?.data?.order);
        }
        if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;
        commitCurrencyList(codes);
        return;
      }

      const ordRes = await fetch(buildApiUrl(`api/transactions/user_currency_order_api.php?_t=${Date.now()}`), {
        credentials: "include",
      }).catch(() => null);

      if (!useGroupAccCurrency) {
        const currencyResults = await Promise.all(
          companyIds.map(async (cid) => {
            const row = companies.find((c) => parseInt(c.id, 10) === cid);
            const vg = groupsAllMode
              ? resolveViewGroupForCompany(row, selectedGroup)
              : groupKey;
            const q = new URLSearchParams({ company_id: String(cid) });
            if (vg) q.set("view_group", vg);
            const curRes = await fetch(
              buildApiUrl(`api/transactions/get_company_currencies_api.php?${q.toString()}`),
              { credentials: "include" }
            );
            const curJson = await curRes.json();
            if (!curRes.ok || !curJson.success || !Array.isArray(curJson.data)) return [];
            return curJson.data.map((r) => String(r.code).toUpperCase());
          })
        );
        codes = [...new Set(currencyResults.flat())];
      }
      if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

      codes = [...new Set(codes)];
      if (ordRes) {
        const ordJson = await ordRes.json();
        codes = orderCurrencyCodes(codes, ordJson?.data?.order);
      }
      if (gen !== currencyLoadGenRef.current || scopeCurrencyKeyRef.current !== scopeKey) return;

      if (!codes.length) {
        if (singleCid) {
          const fallback = currenciesByCompanyRef.current.get(singleCid);
          if (fallback?.length) applyCurrencyCodes(fallback, singleCid);
        } else if (groupKey) {
          const fallback = currenciesByGroupRef.current.get(groupKey);
          if (fallback?.length) applyCurrencyCodes(fallback, null);
        }
        return;
      }

      if (singleCid) {
        applyCurrencyCodes(codes, singleCid);
      } else if (groupKey) {
        applyCurrencyCodes(codes, null);
        currenciesByGroupRef.current.set(groupKey, codes);
      } else if (groupsAllMode) {
        applyCurrencyCodes(codes, null);
        currenciesByGroupRef.current.set("GROUPS:ALL", codes);
      }
    } catch {
      /* Keep previous currency pills on transient errors. */
    }
  }, [
    companyId,
    subsidiaryDashboardScope,
    usesGroupLedgerDashboard,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    groupIds,
    companies,
    mergedSubsetIds,
    buildScopeCurrencyKey,
    applyCurrencyCodes,
    primeCurrenciesFromCache,
    orderCurrencyCodes,
  ]);

  useLayoutEffect(() => {
    loadCurrencies();
  }, [loadCurrencies]);

  /** Warm currency cache per group/default company so AP↔IG switches feel instant. */
  useEffect(() => {
    const independentRows = independentCompaniesForPicker(companies, groupIds);
    if (!companies.length || (!groupIds.length && !independentRows.length)) return undefined;
    let cancelled = false;

    const prefetchGroupOnlyCurrencies = async (gid) => {
      const g = String(gid).trim().toUpperCase();
      if (currenciesByGroupRef.current.has(g)) return;
      const q = buildGroupOnlyScopeCurrencyQuery(companies, g);
      try {
        const res = await fetch(
          buildApiUrl(`api/transactions/get_scope_account_currencies_api.php?${q.toString()}`),
          { credentials: "include" }
        );
        const json = await res.json();
        if (cancelled || !res.ok || !json.success || !Array.isArray(json.data)) return;
        const codes = json.data.map((r) => String(r.code).toUpperCase()).filter(Boolean);
        if (codes.length) {
          currenciesByGroupRef.current.set(g, codes);
          const activeGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
          const activeCid = companyId != null ? parseInt(companyId, 10) : Number.NaN;
          if (
            activeGroup === g &&
            !(Number.isFinite(activeCid) && activeCid > 0) &&
            !groupsAllMode
          ) {
            primeCurrenciesFromCache({ companyId: null, selectedGroup: g, groupsAllMode: false });
          }
        }
      } catch {
        /* Best-effort prefetch. */
      }
    };

    const prefetchCompanyCurrencies = async (cid, viewGroup) => {
      const id = parseInt(cid, 10);
      if (!Number.isFinite(id) || id <= 0 || currenciesByCompanyRef.current.has(id)) return;
      const row = companies.find((c) => parseInt(c.id, 10) === id);
      const isIndependent = row && companyRowIsIndependent(row, groupIds);
      const q = new URLSearchParams({ company_id: String(id) });
      const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
      if (vg) {
        q.set("view_group", vg);
        q.set("group_id", vg);
        q.set("subsidiary_accounts_only", "1");
      } else if (!isIndependent) {
        q.set("subsidiary_accounts_only", "1");
      }
      try {
        const res = await fetch(
          buildApiUrl(`api/transactions/get_scope_account_currencies_api.php?${q.toString()}`),
          { credentials: "include" }
        );
        const json = await res.json();
        if (cancelled || !res.ok || !json.success || !Array.isArray(json.data)) return;
        const codes = json.data.map((r) => String(r.code).toUpperCase()).filter(Boolean);
        if (codes.length) currenciesByCompanyRef.current.set(id, codes);
      } catch {
        /* Best-effort prefetch. */
      }
    };

    const run = () => {
      if (cancelled) return;
      for (const gid of groupIds) {
        void prefetchGroupOnlyCurrencies(gid);
        for (const row of companiesForCompanyPicker(companies, gid, groupIds)) {
          if (!isSubsidiaryCompanyRow(row, groupIds)) continue;
          if (row?.id) void prefetchCompanyCurrencies(row.id, gid);
        }
      }
      for (const row of independentRows) {
        if (row?.id) void prefetchCompanyCurrencies(row.id, null);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [companies, groupIds, me, selectedGroup, companyId, groupsAllMode, primeCurrenciesFromCache]);

  useEffect(() => {
    if (!canShowAllCurrencies && showAllCurrencies) {
      setShowAllCurrencies(false);
      setMultiCurrencyKpi(null);
      setMultiCurrencyKpiPrev(null);
    }
  }, [canShowAllCurrencies, showAllCurrencies]);

  useEffect(() => {
    currencyCodeRef.current = currencyCode;
  }, [currencyCode]);

  useEffect(() => {
    dashboardDataRef.current = dashboardData;
  }, [dashboardData]);

  useEffect(() => {
    dateFromRef.current = dateFrom;
    dateToRef.current = dateTo;
  }, [dateFrom, dateTo]);

  const fetchDashboardPayload = useCallback(
    async (cid, rangeFrom, rangeTo, currencyOverride, viewGroupOverride) => {
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        company_id: String(cid),
      });
      const cur = currencyOverride ?? currencyCodeRef.current;
      if (cur) q.append("currency", cur);
      const viewGroup =
        viewGroupOverride ??
        (selectedGroup ? String(selectedGroup).trim().toUpperCase() : null);
      const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
      const subsidiaryOnly =
        Boolean(viewGroup) && !(row && companyRowIsGroupEntity(row, viewGroup));
      if (subsidiaryOnly) {
        q.append("subsidiary_accounts_only", "1");
      } else if (viewGroup) {
        q.append("view_group", viewGroup);
      }
      const cacheKey = q.toString();
      const cachedPayload = getDashboardPayloadCache(cacheKey);
      if (cachedPayload != null) {
        return cachedPayload;
      }
      const res = await fetch(buildApiUrl(`${DASHBOARD_API}?${q}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }
      let data = json.data;
      if (viewGroup) {
        const gf = String(viewGroup).toUpperCase();
        const row = companies.find((c) => {
          if (parseInt(c.id, 10) !== parseInt(cid, 10)) return false;
          const nativeG = c.group_id ? String(c.group_id).toUpperCase() : "";
          const linkG = c.link_source_group
            ? String(c.link_source_group).trim().toUpperCase()
            : "";
          return nativeG === gf || linkG === gf;
        });
        const pct = row && row.link_percentage !== undefined && row.link_percentage !== null
          ? parseFloat(row.link_percentage)
          : NaN;
        const linkMultiplier = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 1;
        if (linkMultiplier !== 1) {
          data = { ...json.data, _link_multiplier: linkMultiplier };
        }
      }
      setDashboardPayloadCache(cacheKey, data);
      return data;
    },
    [selectedGroup, companies, i18n]
  );

  const applyDashboardPayloadAdjustments = useCallback(
    (data, cid, viewGroupOverride) => {
      if (!data || cid == null) return data;
      const viewGroup =
        viewGroupOverride ??
        (selectedGroup ? String(selectedGroup).trim().toUpperCase() : null);
      if (!viewGroup) return data;
      const gf = String(viewGroup).toUpperCase();
      const row = companies.find((c) => {
        if (parseInt(c.id, 10) !== parseInt(cid, 10)) return false;
        const nativeG = c.group_id ? String(c.group_id).toUpperCase() : "";
        const linkG = c.link_source_group ? String(c.link_source_group).trim().toUpperCase() : "";
        return nativeG === gf || linkG === gf;
      });
      const pct =
        row && row.link_percentage !== undefined && row.link_percentage !== null
          ? parseFloat(row.link_percentage)
          : NaN;
      const linkMultiplier = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 1;
      if (linkMultiplier !== 1) {
        return { ...data, _link_multiplier: linkMultiplier };
      }
      return data;
    },
    [selectedGroup, companies]
  );

  const seedDashboardPayloadCache = useCallback(
    (rangeFrom, rangeTo, currencyOverride, data, viewGroupOverride) => {
      if (!data) return;
      const cur = currencyOverride ?? currencyCodeRef.current;
      if (usesGroupLedgerDashboard && selectedGroup) {
        const vg = String(selectedGroup).trim().toUpperCase();
        const q = new URLSearchParams({
          date_from: rangeFrom,
          date_to: rangeTo,
          view_group: vg,
          group_id: vg,
        });
        if (cur) q.append("currency", cur);
        setDashboardPayloadCache(q.toString(), data);
        return;
      }
      if (companyId == null) return;
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        company_id: String(companyId),
      });
      if (cur) q.append("currency", cur);
      const viewGroup =
        viewGroupOverride ??
        (selectedGroup ? String(selectedGroup).trim().toUpperCase() : null);
      if (subsidiaryDashboardScope) {
        q.append("subsidiary_accounts_only", "1");
      } else if (viewGroup) {
        q.append("view_group", viewGroup);
      }
      setDashboardPayloadCache(q.toString(), data);
    },
    [companyId, usesGroupLedgerDashboard, selectedGroup, subsidiaryDashboardScope]
  );

  const earningsRowsFromBootstrapEntries = useCallback(
    (entries, cidOverride = null, groupOverride = undefined) => {
      const cid = cidOverride ?? companyId;
      const grp = groupOverride !== undefined ? groupOverride : selectedGroup;
      return (entries || []).map(({ code, payload }) => ({
        code,
        earnings: payload
          ? computeKpiMetrics(
              applyDashboardPayloadAdjustments(payload, cid, grp),
              grp
            )?.earnings ?? 0
          : 0,
      }));
    },
    [applyDashboardPayloadAdjustments, companyId, selectedGroup]
  );

  const seedDashboardPayloadCacheForCompany = useCallback(
    (cid, viewGroup, rangeFrom, rangeTo, currencyOverride, data) => {
      if (!data || cid == null) return;
      const cur = currencyOverride ?? currencyCodeRef.current;
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        company_id: String(cid),
      });
      if (cur) q.append("currency", cur);
      const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
      if (vg) {
        const row = companies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10));
        const subsidiaryOnly = row && !companyRowIsGroupEntity(row, vg);
        if (subsidiaryOnly) {
          q.append("subsidiary_accounts_only", "1");
        } else {
          q.append("view_group", vg);
        }
      }
      setDashboardPayloadCache(q.toString(), data);
    },
    [companies]
  );

  const prefetchDashboardCompany = useCallback(
    async (targetRow, viewGroup) => {
      const id = parseInt(targetRow?.id, 10);
      if (!Number.isFinite(id) || id <= 0) return;
      const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
      const cur = currencyCodeRef.current;
      const scopeKey = resolveDashboardScopeKey({
        companyId: id,
        selectedGroup: vg || null,
        groupsAllMode: false,
        groupAllMode: false,
        mergedSubsetIds: null,
        currencyCode: cur,
      });
      if (!scopeKey || getDashboardCache(scopeKey)?.current) return;

      const usesLedger = vg && companyRowIsGroupEntity(targetRow, vg);
      const subScope = Boolean(vg && !usesLedger);
      const rangeFrom = dateFromRef.current;
      const rangeTo = dateToRef.current;

      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        bootstrap_scope: "full",
      });
      if (usesLedger && vg) {
        q.set("view_group", vg);
        q.set("group_id", vg);
      } else {
        q.set("company_id", String(id));
        if (subScope) q.set("subsidiary_accounts_only", "1");
        else if (vg) q.set("view_group", vg);
      }
      if (cur) q.set("currency", cur);
      const codes = currenciesByCompanyRef.current.get(id);
      if (codes?.length > 1) q.set("currencies", codes.join(","));

      try {
        const res = await fetch(buildApiUrl(`${DASHBOARD_BOOTSTRAP_API}?${q}`), {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data?.current) return;

        const current = applyDashboardPayloadAdjustments(json.data.current, id, vg || null);
        const previous = json.data.previous
          ? applyDashboardPayloadAdjustments(json.data.previous, id, vg || null)
          : null;
        const earningsCurrent = earningsRowsFromBootstrapEntries(
          json.data.earnings?.current,
          id,
          vg || null
        );

        if (current) {
          seedDashboardPayloadCacheForCompany(id, vg || null, rangeFrom, rangeTo, cur, current);
        }
        if (previous) {
          const prevRange = previousMonthEquivalentRange(rangeFrom, rangeTo);
          seedDashboardPayloadCacheForCompany(
            id,
            vg || null,
            prevRange.from,
            prevRange.to,
            cur,
            previous
          );
        }

        setDashboardCache(scopeKey, {
          current,
          previous,
          earnings: earningsCurrent.length > 1 ? earningsCurrent : undefined,
        });
      } catch {
        /* Best-effort prefetch. */
      }
    },
    [
      resolveDashboardScopeKey,
      applyDashboardPayloadAdjustments,
      earningsRowsFromBootstrapEntries,
      seedDashboardPayloadCacheForCompany,
    ]
  );

  const loadDashboardViaBootstrap = useCallback(
    async ({ scope = "full", currencyCodesOverride = null } = {}) => {
      const q = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        bootstrap_scope: scope,
      });
      if (usesGroupLedgerDashboard && selectedGroup) {
        const vg = String(selectedGroup).trim().toUpperCase();
        q.set("view_group", vg);
        q.set("group_id", vg);
      } else if (companyId != null) {
        q.set("company_id", String(companyId));
        if (subsidiaryDashboardScope) {
          q.set("subsidiary_accounts_only", "1");
        } else {
          const vg = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
          if (vg) q.set("view_group", vg);
        }
      } else {
        throw new Error(i18n.failedToLoadDashboard);
      }
      if (currencyCode) q.set("currency", currencyCode);

      const codesForBootstrap =
        currencyCodesOverride ??
        (subsidiaryDashboardScope && companyId != null
          ? currenciesByCompanyRef.current.get(parseInt(companyId, 10)) ?? currencies
          : selectedGroup && currencies.length > 0 && !subsidiaryDashboardScope
            ? currencies
            : companyId != null
              ? currenciesByCompanyRef.current.get(parseInt(companyId, 10))
              : null) ??
        (currencies.length > 1 ? currencies : null);
      if (Array.isArray(codesForBootstrap) && codesForBootstrap.length > 1) {
        q.set("currencies", codesForBootstrap.join(","));
      }

      const res = await fetch(buildApiUrl(`${DASHBOARD_BOOTSTRAP_API}?${q}`), {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }
      if ((scope === "full" || scope === "kpi") && !json.data.current) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }

      const current =
        json.data.current != null
          ? applyDashboardPayloadAdjustments(json.data.current, companyId, selectedGroup)
          : null;
      const previous = json.data.previous
        ? applyDashboardPayloadAdjustments(json.data.previous, companyId, selectedGroup)
        : null;

      if (current) {
        seedDashboardPayloadCache(dateFrom, dateTo, currencyCode, current);
      }
      if (previous) {
        const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
        seedDashboardPayloadCache(prevRange.from, prevRange.to, currencyCode, previous);
      }

      const earningsCurrent = earningsRowsFromBootstrapEntries(json.data.earnings?.current);
      const earningsPrevious = earningsRowsFromBootstrapEntries(json.data.earnings?.previous);

      return { current, previous, earningsCurrent, earningsPrevious };
    },
    [
      dateFrom,
      dateTo,
      usesGroupLedgerDashboard,
      selectedGroup,
      companyId,
      subsidiaryDashboardScope,
      currencyCode,
      currencies,
      applyDashboardPayloadAdjustments,
      seedDashboardPayloadCache,
      earningsRowsFromBootstrapEntries,
      i18n.failedToLoadDashboard,
      i18n.dashboardApiError,
    ]
  );

  const fetchGroupDashboardPayload = useCallback(
    async (rangeFrom, rangeTo, currencyOverride, groupIdOverride = null) => {
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
      });
      const cur = currencyOverride ?? currencyCodeRef.current;
      if (cur) q.append("currency", cur);
      const vg =
        groupIdOverride != null
          ? String(groupIdOverride).trim().toUpperCase()
          : selectedGroup
            ? String(selectedGroup).trim().toUpperCase()
            : "";
      if (!vg) {
        throw new Error(i18n.failedToLoadDashboard);
      }
      q.append("view_group", vg);
      q.append("group_id", vg);
      const cacheKey = q.toString();
      const cachedPayload = getDashboardPayloadCache(cacheKey);
      if (cachedPayload != null) {
        return cachedPayload;
      }
      const res = await fetch(buildApiUrl(`${DASHBOARD_API}?${q}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }
      setDashboardPayloadCache(cacheKey, json.data);
      return json.data;
    },
    [selectedGroup, i18n]
  );

  const loadMergedDashboard = useCallback(
    async (rangeFrom, rangeTo, currencyOverride) => {
      if (usesGroupLedgerDashboard && selectedGroup) {
        return fetchGroupDashboardPayload(rangeFrom, rangeTo, currencyOverride);
      }

      const fetchMergedCompanyDashboards = async (companyList) => {
        if (!companyList.length) {
          throw new Error(i18n.failedToLoadDashboard);
        }
        const settled = await Promise.allSettled(
          companyList.map((c) => {
            const cid = parseInt(c.id, 10);
            return fetchDashboardPayload(
              cid,
              rangeFrom,
              rangeTo,
              currencyOverride,
              resolveViewGroupForCompany(c, selectedGroup)
            );
          })
        );
        const results = settled
          .filter((entry) => entry.status === "fulfilled" && entry.value)
          .map((entry) => entry.value);
        if (!results.length) {
          const rejected = settled.find((entry) => entry.status === "rejected");
          throw rejected?.reason ?? new Error(i18n.failedToLoadDashboard);
        }
        return mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      };

      if (groupAllMode) {
        if (groupsAllMode) {
          return fetchMergedCompanyDashboards(resolveGroupsAllMergeCompanyList(companies, groupIds));
        }
        if (selectedGroup) {
          return fetchMergedCompanyDashboards(
            resolveGroupAllMergeCompanyList(companies, selectedGroup, groupIds)
          );
        }
      }

      if (companyId != null) {
        return fetchDashboardPayload(companyId, rangeFrom, rangeTo, currencyOverride);
      }

      if (groupsAllMode && !groupAllMode) {
        const gids = groupIds.filter((g) => String(g || "").trim());
        if (!gids.length) {
          throw new Error(i18n.failedToLoadDashboard);
        }
        const results = await Promise.all(
          gids.map((gid) =>
            fetchGroupDashboardPayload(rangeFrom, rangeTo, currencyOverride, gid)
          )
        );
        return mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      }

      if (mergedSubsetIds && mergedSubsetIds.length > 1) {
        const results = await Promise.all(
          mergedSubsetIds.map((cid) => {
            const row = companies.find((x) => parseInt(x.id, 10) === parseInt(cid, 10));
            return fetchDashboardPayload(
              cid,
              rangeFrom,
              rangeTo,
              currencyOverride,
              resolveViewGroupForCompany(row, selectedGroup)
            );
          })
        );
        return mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      }
      throw new Error(i18n.failedToLoadDashboard);
    },
    [
      companyId,
      usesGroupLedgerDashboard,
      groupAllMode,
      groupsAllMode,
      groupIds,
      selectedGroup,
      mergedSubsetIds,
      companies,
      fetchDashboardPayload,
      fetchGroupDashboardPayload,
      i18n.failedToLoadDashboard,
    ]
  );

  const fetchEarningsRowsForRange = useCallback(
    async (rangeFrom, rangeTo, gen) => {
      const rows = [];
      const activeFrom = dateFromRef.current;
      const activeTo = dateToRef.current;
      const activeCurrency = currencyCodeRef.current;
      const reuseMainPayload =
        rangeFrom === activeFrom &&
        rangeTo === activeTo &&
        dashboardDataRef.current != null;

      for (const code of currencies) {
        if (gen !== earningsFetchGenRef.current) break;
        try {
          let payload;
          if (reuseMainPayload && code === activeCurrency) {
            payload = dashboardDataRef.current;
          } else {
            payload = await loadMergedDashboard(rangeFrom, rangeTo, code);
          }
          if (gen !== earningsFetchGenRef.current) break;
          const metrics = computeKpiMetrics(payload, selectedGroup);
          rows.push({ code, earnings: metrics?.earnings ?? 0 });
        } catch {
          if (gen !== earningsFetchGenRef.current) break;
          rows.push({ code, earnings: 0 });
        }
      }
      return rows;
    },
    [currencies, loadMergedDashboard, selectedGroup]
  );

  const loadEarningsByCurrency = useCallback(async () => {
    const canLoadEarnings =
      (companyId != null || groupAggregateMode) && currencies.length > 1;
    if (!canLoadEarnings) {
      setEarningsByCurrency([]);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const cacheKey = dashboardScopeKey;
    const cached = getDashboardCache(cacheKey);
    if (cached?.earnings?.length === currencies.length) {
      setEarningsByCurrency(cached.earnings);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const canUseDashboardBootstrap =
      !(showAllCurrencies && canShowAllCurrencies) &&
      !(groupsAllMode && !groupAllMode) &&
      !groupAllMode &&
      !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
      (companyId != null || groupAggregateMode);

    const gen = ++earningsFetchGenRef.current;
    setEarningsByCurrencyLoading(true);
    setEarningsByCurrency(currencies.map((code) => ({ code, earnings: null })));
    setEarningsByCurrencyPrev([]);

    if (canUseDashboardBootstrap) {
      try {
        const earningsBoot = await loadDashboardViaBootstrap({
          scope: "earnings",
          currencyCodesOverride: currencies,
        });
        if (gen !== earningsFetchGenRef.current) return;
        if (earningsBoot.earningsCurrent.length > 1) {
          setEarningsByCurrency(earningsBoot.earningsCurrent);
          setEarningsByCurrencyPrev(earningsBoot.earningsPrevious);
          patchDashboardCache(cacheKey, { earnings: earningsBoot.earningsCurrent });
        }
        setEarningsByCurrencyLoading(false);
        return;
      } catch {
        if (gen !== earningsFetchGenRef.current) return;
        /* fall back to legacy per-currency fetch */
      }
    }

    const currentRows = await fetchEarningsRowsForRange(dateFrom, dateTo, gen);
    if (gen !== earningsFetchGenRef.current) return;

    setEarningsByCurrency(currentRows);
    setEarningsByCurrencyLoading(false);
    if (cacheKey && currentRows.length) {
      patchDashboardCache(cacheKey, { earnings: currentRows });
    }

    const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
    void fetchEarningsRowsForRange(prevRange.from, prevRange.to, gen)
      .then((prevRows) => {
        if (gen !== earningsFetchGenRef.current) return;
        setEarningsByCurrencyPrev(prevRows);
      })
      .catch(() => {
        if (gen !== earningsFetchGenRef.current) return;
        setEarningsByCurrencyPrev([]);
      });
  }, [
    companyId,
    groupAggregateMode,
    currencies,
    dateFrom,
    dateTo,
    fetchEarningsRowsForRange,
    loadDashboardViaBootstrap,
    dashboardScopeKey,
    showAllCurrencies,
    canShowAllCurrencies,
    groupsAllMode,
    groupAllMode,
    mergedSubsetIds,
  ]);

  /** Avoid reusing another month's per-currency earnings when the date range changes. */
  useEffect(() => {
    earningsFetchGenRef.current += 1;
    if (currencies.length <= 1) {
      setEarningsByCurrency([]);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }
    const cached = getDashboardCache(dashboardScopeKey);
    if (cached?.earnings?.length === currencies.length) {
      setEarningsByCurrency(cached.earnings);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }
    setEarningsByCurrency(currencies.map((code) => ({ code, earnings: null })));
    setEarningsByCurrencyPrev([]);
    setEarningsByCurrencyLoading(true);
  }, [dateFrom, dateTo, companyId, selectedGroup, currencies, dashboardScopeKey]);

  useEffect(() => {
    const rateBase =
      showAllCurrencies && canShowAllCurrencies ? conversionBaseCurrency : currencyCode;
    if (!rateBase || currencies.length <= 1) {
      setExchangeRates({ rates: { [rateBase]: 1 }, date: null, unsupported: [] });
      setExchangeRatesError("");
      setExchangeRatesLoading(false);
      return undefined;
    }

    let cancelled = false;
    const rateDate = resolveFrankfurterDate(dateTo);
    const cached = peekFrankfurterRatesCache(rateBase, currencies, rateDate);

    if (cached) {
      setExchangeRates({ rates: cached.rates, date: cached.date, unsupported: cached.unsupported });
      setExchangeRatesError("");
      setExchangeRatesLoading(false);
    } else {
      setExchangeRatesLoading(true);
      setExchangeRatesError("");
    }

    (async () => {
      try {
        const { rates, date, unsupported } = await fetchFrankfurterRates(
          rateBase,
          currencies,
          rateDate
        );
        if (!cancelled) {
          setExchangeRates({ rates, date, unsupported });
          setExchangeRatesError("");
        }
      } catch {
        if (!cancelled) {
          setExchangeRates({ rates: { [rateBase]: 1 }, date: null, unsupported: currencies });
          setExchangeRatesError("failed");
        }
      } finally {
        if (!cancelled) setExchangeRatesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currencyCode, currencies, dateTo, showAllCurrencies, canShowAllCurrencies, conversionBaseCurrency]);

  const loadAllCurrenciesDashboard = useCallback(
    async (rangeFrom, rangeTo) => {
      const base = conversionBaseCurrency;
      const rateDate = resolveFrankfurterDate(rangeTo);
      let rates = peekFrankfurterRatesCache(base, currencies, rateDate)?.rates;
      if (!rates || !Object.keys(rates).length) {
        const fx = await fetchFrankfurterRates(base, currencies, rateDate);
        rates = fx.rates;
      }

      const perCurrency = await Promise.all(
        currencies.map(async (code) => {
          const data = await loadMergedDashboard(rangeFrom, rangeTo, code);
          const metrics = computeKpiMetrics(data, selectedGroup);
          return { code, data, metrics };
        })
      );

      const aggregated = sumConvertedKpiMetrics(
        perCurrency.map(({ code, metrics }) => ({ code, ...metrics })),
        base,
        rates
      );
      const baseEntry =
        perCurrency.find((row) => row.code === base) ?? perCurrency[0] ?? null;
      return { data: baseEntry?.data ?? null, metrics: aggregated };
    },
    [conversionBaseCurrency, currencies, loadMergedDashboard, selectedGroup]
  );

  const loadDashboard = useCallback(async () => {
    if (!dashboardScopeKey) {
      setLoading(false);
      setDashboardData(null);
      setDashboardDataPrev(null);
      setDisplayScopeKey("");
      setMultiCurrencyKpi(null);
      setMultiCurrencyKpiPrev(null);
      return;
    }
    const gen = ++dashboardFetchGenRef.current;
    const cacheKey = dashboardScopeKey;
    const cached = getDashboardCache(cacheKey);
    const allCurrenciesActive = showAllCurrencies && canShowAllCurrencies;
    setLoadError("");

    if (cached?.current) {
      setDashboardData(cached.current);
      setDashboardDataPrev(cached.previous ?? null);
      setDisplayScopeKey(cacheKey);
      if (cached.earnings?.length) setEarningsByCurrency(cached.earnings);
      if (cached.multiCurrencyKpi) setMultiCurrencyKpi(cached.multiCurrencyKpi);
      if (cached.multiCurrencyKpiPrev) setMultiCurrencyKpiPrev(cached.multiCurrencyKpiPrev);
      if (!allCurrenciesActive) {
        setMultiCurrencyKpi(null);
        setMultiCurrencyKpiPrev(null);
      }
      setLoading(false);
    } else {
      let hydratedFromPayload = false;
      if (
        companyId != null &&
        !allCurrenciesActive &&
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1)
      ) {
        const q = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
          company_id: String(companyId),
        });
        if (currencyCode) q.append("currency", currencyCode);
        if (subsidiaryDashboardScope) {
          q.append("subsidiary_accounts_only", "1");
        } else if (selectedGroup) {
          q.append("view_group", String(selectedGroup).trim().toUpperCase());
        }
        const payload = getDashboardPayloadCache(q.toString());
        if (payload) {
          const adjusted = applyDashboardPayloadAdjustments(payload, companyId, selectedGroup);
          setDashboardData(adjusted);
          setDisplayScopeKey(cacheKey);
          setLoading(false);
          hydratedFromPayload = true;
        }
      }
      if (!hydratedFromPayload) {
        setLoading(true);
        setDashboardData(null);
        setDashboardDataPrev(null);
        setDisplayScopeKey("");
        setMultiCurrencyKpi(null);
        setMultiCurrencyKpiPrev(null);
      }
    }
    if (!cached?.earnings?.length) {
      setEarningsByCurrency([]);
      setEarningsByCurrencyPrev([]);
    }

    try {
      let current;
      let currentKpi = null;
      const canUseDashboardBootstrap =
        !allCurrenciesActive &&
        !(groupsAllMode && !groupAllMode) &&
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        (companyId != null || groupAggregateMode);

      if (canUseDashboardBootstrap) {
        try {
          const boot = await loadDashboardViaBootstrap({ scope: "kpi" });
          if (gen !== dashboardFetchGenRef.current) return;

          current = boot.current;
          setMultiCurrencyKpi(null);
          setMultiCurrencyKpiPrev(null);
          setDashboardData(current);
          setDashboardDataPrev(boot.previous);
          setDisplayScopeKey(cacheKey);
          setLoading(false);

          setDashboardCache(cacheKey, {
            current,
            previous: boot.previous,
            earnings: cached?.earnings,
            multiCurrencyKpi: null,
            multiCurrencyKpiPrev: null,
          });

          const codesForEarnings =
            (subsidiaryDashboardScope && companyId != null
              ? currenciesByCompanyRef.current.get(parseInt(companyId, 10)) ?? currencies
              : selectedGroup && currencies.length > 0 && !subsidiaryDashboardScope
                ? currencies
                : companyId != null
                  ? currenciesByCompanyRef.current.get(parseInt(companyId, 10))
                  : null) ??
            (currencies.length > 1 ? currencies : null);
          if (Array.isArray(codesForEarnings) && codesForEarnings.length > 1) {
            setEarningsByCurrencyLoading(true);
            setEarningsByCurrency(codesForEarnings.map((code) => ({ code, earnings: null })));
            void loadDashboardViaBootstrap({
              scope: "earnings",
              currencyCodesOverride: codesForEarnings,
            })
              .then((earningsBoot) => {
                if (gen !== dashboardFetchGenRef.current) return;
                if (earningsBoot.earningsCurrent.length > 1) {
                  setEarningsByCurrency(earningsBoot.earningsCurrent);
                  setEarningsByCurrencyPrev(earningsBoot.earningsPrevious);
                  patchDashboardCache(cacheKey, { earnings: earningsBoot.earningsCurrent });
                }
                setEarningsByCurrencyLoading(false);
              })
              .catch(() => {
                if (gen !== dashboardFetchGenRef.current) return;
                setEarningsByCurrencyLoading(false);
              });
          } else if (boot.earningsCurrent.length > 1) {
            setEarningsByCurrency(boot.earningsCurrent);
            setEarningsByCurrencyPrev(boot.earningsPrevious);
            setEarningsByCurrencyLoading(false);
            patchDashboardCache(cacheKey, { earnings: boot.earningsCurrent });
          }

          return;
        } catch {
          /* Fall back to legacy per-endpoint loading. */
        }
      }

      if (allCurrenciesActive) {
        const currentBundle = await loadAllCurrenciesDashboard(dateFrom, dateTo);
        if (gen !== dashboardFetchGenRef.current) return;
        current = currentBundle.data;
        currentKpi = currentBundle.metrics;
        setMultiCurrencyKpi(currentKpi);
        setDashboardData(current);
        setDisplayScopeKey(cacheKey);
        setLoading(false);
        patchDashboardCache(cacheKey, {
          current,
          multiCurrencyKpi: currentKpi,
          multiCurrencyKpiPrev: cached?.multiCurrencyKpiPrev ?? null,
        });

        const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
        void loadAllCurrenciesDashboard(prevRange.from, prevRange.to)
          .then((prevBundle) => {
            if (gen !== dashboardFetchGenRef.current) return;
            setDashboardDataPrev(prevBundle.data);
            setMultiCurrencyKpiPrev(prevBundle.metrics);
            patchDashboardCache(cacheKey, {
              current,
              previous: prevBundle.data,
              multiCurrencyKpi: currentKpi,
              multiCurrencyKpiPrev: prevBundle.metrics,
            });
          })
          .catch(() => {
            if (gen !== dashboardFetchGenRef.current) return;
            setDashboardDataPrev(null);
            setMultiCurrencyKpiPrev(null);
          });
        return;
      } else {
        setMultiCurrencyKpi(null);
        setMultiCurrencyKpiPrev(null);
        current = await loadMergedDashboard(dateFrom, dateTo, currencyCode);
        if (gen !== dashboardFetchGenRef.current) return;

        setDashboardData(current);
        setDisplayScopeKey(cacheKey);
        setLoading(false);
        patchDashboardCache(cacheKey, { current, previous: cached?.previous ?? null });

        const prevRange = previousMonthEquivalentRange(dateFrom, dateTo);
        void loadMergedDashboard(prevRange.from, prevRange.to, currencyCode)
          .then((previous) => {
            if (gen !== dashboardFetchGenRef.current) return;
            setDashboardDataPrev(previous);
            patchDashboardCache(cacheKey, { current, previous });
          })
          .catch(() => {
            if (gen !== dashboardFetchGenRef.current) return;
            setDashboardDataPrev(null);
          });
        return;
      }
    } catch (e) {
      if (gen !== dashboardFetchGenRef.current) return;
      setLoadError(e.message || i18n.failedToLoadDashboard);
      setDisplayScopeKey(cacheKey);
      if (!cached?.current) {
        setDashboardData(null);
        setDashboardDataPrev(null);
        setMultiCurrencyKpi(null);
        setMultiCurrencyKpiPrev(null);
      }
    } finally {
      if (gen === dashboardFetchGenRef.current) setLoading(false);
    }
  }, [
    dateFrom,
    dateTo,
    currencyCode,
    loadMergedDashboard,
    loadAllCurrenciesDashboard,
    loadDashboardViaBootstrap,
    applyDashboardPayloadAdjustments,
    subsidiaryDashboardScope,
    i18n,
    dashboardScopeKey,
    showAllCurrencies,
    canShowAllCurrencies,
    groupsAllMode,
    groupAllMode,
    mergedSubsetIds,
    groupAggregateMode,
    companyId,
  ]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /** Prefetch sibling companies so AP/IG company switches can show cached KPIs immediately. */
  useEffect(() => {
    if (!companies.length || !dateFrom || !dateTo || groupAllMode) return undefined;
    let cancelled = false;
    const activeId = companyId != null ? parseInt(companyId, 10) : null;

    const run = () => {
      if (cancelled) return;
      if (selectedGroup) {
        for (const row of resolveGroupAllMergeCompanyList(companies, selectedGroup, groupIds)) {
          const rid = parseInt(row.id, 10);
          if (!Number.isFinite(rid) || rid === activeId) continue;
          void prefetchDashboardCompany(row, selectedGroup);
        }
      } else if (activeId != null) {
        for (const row of independentCompaniesForPicker(companies, groupIds)) {
          const rid = parseInt(row.id, 10);
          if (!Number.isFinite(rid) || rid === activeId) continue;
          void prefetchDashboardCompany(row, null);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    companies,
    dateFrom,
    dateTo,
    companyId,
    selectedGroup,
    groupAllMode,
    groupIds,
    prefetchDashboardCompany,
  ]);

  useEffect(() => {
    if (loading || !dashboardData || currencies.length <= 1) return undefined;
    if (earningsByCurrencyLoading) return undefined;
    const cached = getDashboardCache(dashboardScopeKey);
    if (cached?.earnings?.length === currencies.length) {
      setEarningsByCurrency(cached.earnings);
      setEarningsByCurrencyLoading(false);
      return undefined;
    }
    const run = () => void loadEarningsByCurrency();
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timerId = window.setTimeout(run, 400);
    return () => window.clearTimeout(timerId);
  }, [loading, dashboardData, currencies.length, loadEarningsByCurrency, dashboardScopeKey, earningsByCurrencyLoading]);

  const kpiCompareLabel = i18n.thanLastMonth;

  const kpi = useMemo(() => {
    const empty = {
      profit: 0,
      expenses: 0,
      netProfit: 0,
      earnings: 0,
      showEarnings: false,
      comparisons: null,
    };
    const useAggregated = showAllCurrencies && canShowAllCurrencies && multiCurrencyKpi;
    const ownershipCurrent = computeKpiMetrics(dashboardData, selectedGroup);
    const ownershipPrevious = computeKpiMetrics(dashboardDataPrev, selectedGroup);
    let current = useAggregated
      ? multiCurrencyKpi
      : ownershipCurrent;
    if (!current) return empty;
    if (ownershipCurrent) {
      current = {
        ...current,
        earnings: ownershipCurrent.earnings,
        showEarnings: ownershipCurrent.showEarnings,
      };
    }
    let previous = useAggregated ? multiCurrencyKpiPrev : ownershipPrevious;
    if (previous && ownershipPrevious) {
      previous = { ...previous, earnings: ownershipPrevious.earnings };
    }
    const comparisons = previous
      ? {
          profit: buildKpiCompare(current.profit, previous.profit),
          expenses: buildKpiCompare(current.expenses, previous.expenses),
          netProfit: buildKpiCompare(current.netProfit, previous.netProfit),
          earnings: buildKpiCompare(current.earnings, previous.earnings),
        }
      : null;
    return { ...current, comparisons };
  }, [
    dashboardData,
    dashboardDataPrev,
    selectedGroup,
    showAllCurrencies,
    canShowAllCurrencies,
    multiCurrencyKpi,
    multiCurrencyKpiPrev,
  ]);

  const chartAggregateByMonth = useMemo(
    () => shouldAggregateChartByMonth(dateFrom, dateTo),
    [dateFrom, dateTo]
  );

  const chartRows = useMemo(
    () =>
      dashboardData
        ? buildChartRows(dashboardData, dateFrom, dateTo, i18n.locale, selectedGroup)
        : [],
    [dashboardData, dateFrom, dateTo, i18n.locale, selectedGroup]
  );

  const chartMonthSpanCount = useMemo(
    () => chartMonthSpan(dateFrom, dateTo),
    [dateFrom, dateTo]
  );

  const chartXAxisLayout = useMemo(() => {
    const n = chartRows.length;
    const compact = !chartAggregateByMonth && n > 14;
    const marginBottom = compact ? 22 : 20;
    const tickSkip = chartAggregateByMonth
      ? { interval: 0, minTickGap: 0 }
      : resolveDailyChartXAxisTicks(n, chartMonthSpanCount);
    return {
      ...tickSkip,
      tick: makeDashboardChartXTick(compact),
      height: marginBottom,
      marginBottom,
    };
  }, [chartRows.length, chartAggregateByMonth, chartMonthSpanCount]);

  const displayCurrencyCode =
    showAllCurrencies && canShowAllCurrencies ? conversionBaseCurrency : currencyCode;

  const kpiFooter = useMemo(() => {
    const cur =
      showAllCurrencies && canShowAllCurrencies
        ? `${i18n.all} · ${conversionBaseCurrency || "—"}`
        : currencyCode || "—";
    const from = parseYmd(dateFrom);
    const to = parseYmd(dateTo);
    const loc = i18n.locale;
    if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
      const monthYear = to.toLocaleDateString(loc, { month: "short", year: "numeric" });
      return `${cur} · ${monthYear}`;
    }
    const left = from.toLocaleDateString(loc, { month: "short", day: "numeric" });
    const right = to.toLocaleDateString(loc, { month: "short", day: "numeric", year: "numeric" });
    return `${cur} · ${left} – ${right}`;
  }, [
    currencyCode,
    conversionBaseCurrency,
    showAllCurrencies,
    canShowAllCurrencies,
    i18n.all,
    dateFrom,
    dateTo,
    i18n.locale,
  ]);

  const chartDateRangeText = useMemo(() => {
    if (dashboardData?.date_range) {
      return `${formatDisplayDate(dashboardData.date_range.from)} ${i18n.to} ${formatDisplayDate(
        dashboardData.date_range.to
      )}`;
    }
    return `${formatDisplayDate(dateFrom)} ${i18n.to} ${formatDisplayDate(dateTo)}`;
  }, [dashboardData, dateFrom, dateTo, i18n.to]);

  const chartSeries = useMemo(() => {
    const series = [
      { idx: 0, label: i18n.profit, color: DASHBOARD_PROFIT_COLOR, dataKey: "profit", fill: "url(#gProfit)" },
      { idx: 1, label: i18n.expenses, color: "#ef4444", dataKey: "expenses", fill: "url(#gExp)" },
      { idx: 2, label: i18n.netProfitChart, color: "#10b981", dataKey: "netProfit", fill: "url(#gNet)" },
    ];
    if (kpi.showEarnings) {
      series.push({ idx: 3, label: i18n.earnings, color: "#f59e0b", dataKey: "earnings", fill: "url(#gEarn)" });
    }
    return series;
  }, [i18n, kpi.showEarnings]);

  const earningsCurrencyRows = useMemo(() => {
    const baseRows = earningsByCurrency.length
      ? earningsByCurrency
      : currencies.map((code) => ({
          code,
          earnings: code === currencyCode && dashboardData ? kpi.earnings : null,
        }));

    const base = String(displayCurrencyCode || "").toUpperCase();
    const rates = exchangeRates.rates || {};
    const canConvert =
      currencies.length > 1 &&
      !exchangeRatesError &&
      Object.keys(rates).length > 0 &&
      !exchangeRatesLoading;

    return baseRows.map((row) => {
      const earningsConverted =
        canConvert && row.earnings != null
          ? convertToBaseAmount(row.earnings, row.code, base, rates)
          : null;
      return {
        ...row,
        earningsConverted,
      };
    });
  }, [
    earningsByCurrency,
    currencies,
    displayCurrencyCode,
    currencyCode,
    kpi.earnings,
    dashboardData,
    exchangeRates.rates,
    exchangeRatesError,
    exchangeRatesLoading,
  ]);

  const allCurrencyEarningsReady = useMemo(
    () =>
      currencies.length <= 1 ||
      (earningsCurrencyRows.length === currencies.length &&
        earningsCurrencyRows.every((row) => row.earnings != null)),
    [currencies.length, earningsCurrencyRows]
  );

  const useConvertedEarnings = useMemo(
    () =>
      currencies.length > 1 &&
      !exchangeRatesError &&
      !exchangeRatesLoading &&
      Object.keys(exchangeRates.rates || {}).length > 0 &&
      (allCurrencyEarningsReady || (showAllCurrencies && canShowAllCurrencies)),
    [
      currencies.length,
      exchangeRatesError,
      exchangeRatesLoading,
      exchangeRates.rates,
      allCurrencyEarningsReady,
      showAllCurrencies,
      canShowAllCurrencies,
    ]
  );

  /** UI column mode: avoid flashing "Share" while rates/earnings still load (multi-currency). */
  const earningsBreakdownShowsRate = useMemo(
    () => currencies.length > 1 && !exchangeRatesError,
    [currencies.length, exchangeRatesError]
  );

  const convertedEarningsTotal = useMemo(() => {
    if (!useConvertedEarnings) return null;
    return sumConvertedEarnings(earningsCurrencyRows, displayCurrencyCode, exchangeRates.rates)
      .total;
  }, [useConvertedEarnings, earningsCurrencyRows, displayCurrencyCode, exchangeRates.rates]);

  const earningsCurrencyRowsPrev = useMemo(() => {
    if (!earningsByCurrencyPrev.length) return [];
    const base = String(currencyCode || "").toUpperCase();
    const rates = exchangeRates.rates || {};
    const canConvert =
      currencies.length > 1 &&
      !exchangeRatesError &&
      Object.keys(rates).length > 0 &&
      !exchangeRatesLoading;

    return earningsByCurrencyPrev.map((row) => ({
      ...row,
      earningsConverted:
        canConvert && row.earnings != null
          ? convertToBaseAmount(row.earnings, row.code, base, rates)
          : null,
    }));
  }, [
    earningsByCurrencyPrev,
    currencyCode,
    currencies.length,
    exchangeRates.rates,
    exchangeRatesError,
    exchangeRatesLoading,
  ]);

  const convertedEarningsTotalPrev = useMemo(() => {
    if (!useConvertedEarnings || !earningsCurrencyRowsPrev.length) return null;
    return sumConvertedEarnings(earningsCurrencyRowsPrev, currencyCode, exchangeRates.rates).total;
  }, [useConvertedEarnings, earningsCurrencyRowsPrev, currencyCode, exchangeRates.rates]);

  /** Pie panel total only — includes multi-currency conversion when rates are available. */
  const summaryEarningsValue = useMemo(() => {
    if (showAllCurrencies && canShowAllCurrencies && multiCurrencyKpi) {
      return multiCurrencyKpi.earnings;
    }
    if (useConvertedEarnings && convertedEarningsTotal != null) {
      return convertedEarningsTotal;
    }
    return kpi.earnings;
  }, [
    showAllCurrencies,
    canShowAllCurrencies,
    multiCurrencyKpi,
    useConvertedEarnings,
    convertedEarningsTotal,
    kpi.earnings,
  ]);

  const summaryConversionNote = useMemo(() => {
    if (!earningsBreakdownShowsRate) return "";
    return i18n.earningsIncludesConversion;
  }, [earningsBreakdownShowsRate, i18n.earningsIncludesConversion]);

  const rateFootnoteText = useMemo(() => {
    if (currencies.length <= 1) return "";
    if (exchangeRatesLoading) return i18n.rateLoading;
    if (exchangeRatesError) return i18n.rateUnavailable;
    const foreignCodes = currencies
      .map((c) => String(c).toUpperCase())
      .filter((c) => c !== String(displayCurrencyCode).toUpperCase());
    if (!foreignCodes.length) return "";
    const dateLabel = exchangeRates.date || "—";
    let text = formatI18nTemplate(i18n.rateFootnote, {
      codes: foreignCodes.join(", "),
      date: dateLabel,
    });
    if (exchangeRates.unsupported?.length) {
      text += ` · ${i18n.rateUnavailable}`;
    }
    return text;
  }, [
    currencies,
    displayCurrencyCode,
    exchangeRatesLoading,
    exchangeRatesError,
    exchangeRates.date,
    exchangeRates.unsupported,
    i18n,
  ]);

  const scopeDataPending =
    Boolean(dashboardScopeKey) && displayScopeKey !== dashboardScopeKey;
  const summaryEarningsLoading =
    scopeDataPending ||
    (loading && !dashboardData) ||
    (currencies.length > 1 &&
      !exchangeRatesError &&
      (earningsByCurrencyLoading ||
        exchangeRatesLoading ||
        !allCurrencyEarningsReady ||
        (useConvertedEarnings && convertedEarningsTotal == null)));
  const kpiLoading = scopeDataPending || (loading && !dashboardData);

  useLayoutEffect(() => {
    if (
      typeof sessionStorage === "undefined" ||
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) !== "1"
    ) {
      return;
    }
    if (selectedGroup == null) return;
    setSelectedGroup(null);
  }, [selectedGroup, groupFilterOptOutTick]);

  const handlePickGroup = useCallback(
    (gid) => {
      companySwitchGenRef.current += 1;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      if (g === selectedGroup && !groupsAllMode) {
        const target = resolveCompanyWhenClosingGroup(companies, companyId, groupIds);

        if (target?.id) {
          const id = parseInt(target.id, 10);
          flushSync(() => {
            setGroupsAllMode(false);
            setGroupAllMode(false);
            setMergedSubsetIds(null);
            setSelectedGroup(null);
            applyCompanySelection(id);
          });
          clearDashboardGroupFilterKeepCompany(id, { companyRow: target });
          setGroupFilterOptOutTick((n) => n + 1);
          primeCurrenciesFromCache({
            companyId: id,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            clearOnMiss: true,
          });
          primeDashboardFromCache({
            companyId: id,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            mergedSubsetIds: null,
          });
          void syncCompanySession(id, null);
        } else if (companyId != null) {
          flushSync(() => {
            setGroupsAllMode(false);
            setGroupAllMode(false);
            setMergedSubsetIds(null);
            setSelectedGroup(null);
          });
          clearDashboardGroupFilterKeepCompany(companyId);
          setGroupFilterOptOutTick((n) => n + 1);
          void syncCompanySession(companyId, null);
        } else {
          flushSync(() => {
            setGroupsAllMode(false);
            setGroupAllMode(false);
            setMergedSubsetIds(null);
            setSelectedGroup(null);
          });
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
            sessionStorage.removeItem("dashboard_group_filter");
          }
          setGroupFilterOptOutTick((n) => n + 1);
          persistDashboardGroupOnlyMode(false);
          persistDashboardFilterState(null, null, { allowGroupOnly: false });
          notifyDashboardGroupFilterChanged(null, null);
        }
        return;
      }

      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
      }
      setGroupFilterOptOutTick((n) => n + 1);

      if (canUseGroupOnlyMode(me, g, companies)) {
        setGroupsAllMode(false);
        setSelectedGroup(g);
        persistDashboardGroupFilter(g);
        resetAnchorSessionRef();
        clearCompanySelection(g);
        primeCurrenciesFromCache({ companyId: null, selectedGroup: g, groupsAllMode: false });
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, { me, preferredCompanyId: null });
      if (!pick?.id) {
        resetAnchorSessionRef();
        clearCompanySelection(g);
        primeCurrenciesFromCache({ companyId: null, selectedGroup: g, groupsAllMode: false });
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      const id = parseInt(pick.id, 10);
      setGroupsAllMode(false);
      persistDashboardFilterState(g, id, { allowGroupOnly: false });
      const notifyOpts = { companyCode: pick.company_id, ignoreGroupOnly: true };
      const cachedFlags = peekCompanySessionFlags(id);
      if (cachedFlags) {
        notifyOpts.hasGambling = Boolean(cachedFlags.has_gambling);
        notifyOpts.hasBank = Boolean(cachedFlags.has_bank);
      }
      notifyDashboardGroupFilterChanged(g, id, notifyOpts);
      setGroupAllMode(false);
      setMergedSubsetIds(null);
      setSelectedGroup(g);
      persistDashboardGroupFilter(g);
      applyCompanySelection(id);
      primeCurrenciesFromCache({ companyId: id, selectedGroup: g, groupsAllMode: false });
      primeDashboardFromCache({
        companyId: id,
        selectedGroup: g,
        groupsAllMode: false,
        groupAllMode: false,
        mergedSubsetIds: null,
      });
      void syncCompanySession(id, g);
    },
    [
      selectedGroup,
      groupsAllMode,
      companyId,
      me,
      companies,
      groupIds,
      applyCompanySelection,
      syncCompanySession,
      primeCurrenciesFromCache,
      primeDashboardFromCache,
      resetAnchorSessionRef,
    ]
  );

  const handlePickCompany = useCallback(
    (c) => {
      const id = parseInt(c.id, 10);
      const nativeGid = normalizeNativeCompanyGroupId(c);
      const gid = nativeGid ? String(nativeGid).toUpperCase() : null;
      const isActive =
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        companyId != null &&
        parseInt(companyId, 10) === id &&
        (groupsAllMode || !gid || gid === selectedGroup);
      if (isActive) {
        if (!canUseGroupOnlyMode(me)) return;
        clearCompanySelection();
        return;
      }

      const switchGen = ++companySwitchGenRef.current;
      const prevId = companyId;
      const persistGroup = groupsAllMode ? null : gid;
      if (!groupsAllMode) {
        if (gid) {
          setSelectedGroup(gid);
          sessionStorage.setItem("dashboard_group_filter", gid);
        } else {
          setSelectedGroup(null);
          sessionStorage.removeItem("dashboard_group_filter");
        }
      }
      persistDashboardFilterState(persistGroup, id);
      const notifyOpts = { companyCode: c.company_id, ignoreGroupOnly: true, expirationDate: c.expiration_date ?? null };
      const cachedFlags = peekCompanySessionFlags(id);
      if (cachedFlags) {
        notifyOpts.hasGambling = Boolean(cachedFlags.has_gambling);
        notifyOpts.hasBank = Boolean(cachedFlags.has_bank);
      }
      notifyDashboardGroupFilterChanged(persistGroup, id, notifyOpts);
      applyCompanySelection(id);
      primeCurrenciesFromCache({
        companyId: id,
        selectedGroup: groupsAllMode ? null : gid,
        groupsAllMode: false,
        groupAllMode: false,
        clearOnMiss: !gid && !groupsAllMode,
      });
      primeDashboardFromCache({
        companyId: id,
        selectedGroup: groupsAllMode ? null : gid,
        groupsAllMode: false,
        groupAllMode: false,
        mergedSubsetIds: null,
      });
      void syncCompanySession(id, groupsAllMode ? null : gid || selectedGroup, switchGen).then((ok) => {
        if (switchGen !== companySwitchGenRef.current) return;
        if (!ok && prevId != null) {
          const prevCo = companies.find((x) => parseInt(x.id, 10) === parseInt(prevId, 10));
          if (prevCo?.group_id) {
            setSelectedGroup(String(prevCo.group_id).toUpperCase());
            sessionStorage.setItem("dashboard_group_filter", String(prevCo.group_id).toUpperCase());
          }
          applyCompanySelection(prevId);
        }
      });
    },
    [
      companyId,
      selectedGroup,
      groupsAllMode,
      groupAllMode,
      mergedSubsetIds,
      companies,
      applyCompanySelection,
      syncCompanySession,
      clearCompanySelection,
      primeCurrenciesFromCache,
      primeDashboardFromCache,
      me,
    ]
  );

  const handlePickAllInGroup = useCallback(() => {
    const list = resolveMergeCompanyList();
    if (!list.length) return;
    if (list.length === 1) {
      handlePickCompany(list[0]);
      return;
    }
    setGroupAllMode(true);
    setMergedSubsetIds(null);
    setCompanyId(null);
    const groupForPersist = groupsAllMode ? null : selectedGroup;
    persistDashboardFilterState(groupForPersist, null, { allowGroupOnly: false });
    primeCurrenciesFromCache({
      companyId: null,
      selectedGroup: groupForPersist,
      groupsAllMode,
    });
    notifyDashboardGroupFilterChanged(groupForPersist, null);
  }, [
    resolveMergeCompanyList,
    handlePickCompany,
    groupsAllMode,
    selectedGroup,
    primeCurrenciesFromCache,
  ]);

  const handlePickAllGroups = useCallback(() => {
    if (groupsAllMode) return;
    const target = resolveCompanyWhenPickingAllGroups(companies, companyId, groupIds);
    setGroupsAllMode(true);
    setGroupAllMode(false);
    setMergedSubsetIds(null);
    setSelectedGroup(null);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("dashboard_group_filter");
    }
    if (target?.id && Number(target.id) !== Number(companyId)) {
      const id = parseInt(target.id, 10);
      persistDashboardFilterState(null, id, { allowGroupOnly: false });
      notifyDashboardGroupFilterChanged(null, id, { companyCode: target.company_id });
      applyCompanySelection(id);
      primeCurrenciesFromCache({ companyId: id, selectedGroup: null, groupsAllMode: true });
      primeDashboardFromCache({
        companyId: id,
        selectedGroup: null,
        groupsAllMode: true,
        groupAllMode: false,
        mergedSubsetIds: null,
      });
      void syncCompanySession(id, null);
      return;
    }
    persistDashboardFilterState(null, companyId, { allowGroupOnly: false });
    primeCurrenciesFromCache({
      companyId,
      selectedGroup: null,
      groupsAllMode: true,
    });
    primeDashboardFromCache({
      companyId,
      selectedGroup: null,
      groupsAllMode: true,
      groupAllMode: false,
      mergedSubsetIds: null,
    });
    notifyDashboardGroupFilterChanged(null, companyId);
  }, [
    groupsAllMode,
    companyId,
    companies,
    groupIds,
    applyCompanySelection,
    syncCompanySession,
    primeCurrenciesFromCache,
    primeDashboardFromCache,
  ]);

  useLayoutEffect(() => {
    if (!groupsAllMode || groupAllMode || !companiesForPicker.length) return;
    const cid = companyId != null ? parseInt(companyId, 10) : Number.NaN;
    const inPicker =
      Number.isFinite(cid) &&
      cid > 0 &&
      companiesForPicker.some((c) => parseInt(c.id, 10) === cid);
    if (inPicker) return;
    const target = resolveCompanyWhenPickingAllGroups(companies, companyId, groupIds);
    if (!target?.id) return;
    const id = parseInt(target.id, 10);
    applyCompanySelection(id);
    persistDashboardFilterState(null, id, { allowGroupOnly: false });
    notifyDashboardGroupFilterChanged(null, id, { companyCode: target.company_id });
  }, [
    groupsAllMode,
    groupAllMode,
    companyId,
    companiesForPicker,
    companies,
    groupIds,
    applyCompanySelection,
  ]);

  useLayoutEffect(() => {
    if (!me || companyId != null || groupAllMode) return;
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
    ) {
      return;
    }
    if (companyLoginRequiresSubsidiaryWithGroup(me)) {
      if (groupsAllMode) setGroupsAllMode(false);
    } else if (
      groupsAllMode ||
      (isDashboardGroupOnlyMode() && canUseGroupOnlyMode(me, selectedGroup, companies))
    ) {
      return;
    }

    persistDashboardGroupOnlyMode(false);

    let id = me?.company_id ? parseInt(me.company_id, 10) : Number.NaN;
    let bootGroup = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;

    if (selectedGroup && companies.length) {
      const pick = pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
        me,
        preferredCompanyId: Number.isFinite(id) ? id : null,
      });
      if (pick?.id) {
        id = parseInt(pick.id, 10);
        bootGroup = selectedGroup;
      }
    } else if (Number.isFinite(id)) {
      const row = companies.find((c) => parseInt(c.id, 10) === id);
      const g = row && !companyRowIsIndependent(row, groupIds) ? normalizeCompanyGroupId(row) : null;
      if (g) {
        bootGroup = g;
        setSelectedGroup(g);
        persistDashboardGroupFilter(g);
      }
    }

    if (!Number.isFinite(id) || id <= 0) return;

    setGroupAllMode(false);
    persistDashboardFilterState(bootGroup, id, { allowGroupOnly: false });
    applyCompanySelection(id);
    notifyDashboardGroupFilterChanged(bootGroup, id);
    void syncCompanySession(id, bootGroup);
  }, [
    me,
    selectedGroup,
    companyId,
    groupsAllMode,
    groupAllMode,
    companies,
    groupIds,
    applyCompanySelection,
    syncCompanySession,
  ]);

  const toggleChartSeries = useCallback((idx) => {
    setChartVisible((v) => {
      const n = [...v];
      n[idx] = !n[idx];
      return n;
    });
  }, []);

  const closeCompanyAccessModal = useCallback(() => {
    setCompanyAccessModal({ open: false, message: "" });
  }, []);

  const handleToggleAllCurrencies = useCallback(() => {
    if (!currencies.length) return;
    setShowAllCurrencies((prev) => !prev);
  }, [currencies.length]);

  const resolveCurrencyOrderCompanyId = useCallback(() => {
    const singleCid = companyId != null ? parseInt(companyId, 10) : null;
    if (Number.isFinite(singleCid) && singleCid > 0) return singleCid;
    const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
    if (groupKey) {
      const anchorId = pickGroupAnchorCompany(companies, groupKey)?.id;
      const n = anchorId != null ? parseInt(anchorId, 10) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    }
    const sessionCid = me?.company_id != null ? parseInt(me.company_id, 10) : NaN;
    if (Number.isFinite(sessionCid) && sessionCid > 0) return sessionCid;
    const first = companiesForPicker[0]?.id;
    const firstN = first != null ? parseInt(first, 10) : NaN;
    return Number.isFinite(firstN) && firstN > 0 ? firstN : null;
  }, [companyId, selectedGroup, companies, me?.company_id, companiesForPicker]);

  const applyCrossPageCurrency = useCallback((code) => {
    setShowAllCurrencies(false);
    setCurrencyCode(code);
  }, []);

  const { persistSelection: persistCrossPageCurrency } = useCrossPageCurrencySync({
    enabled: currencies.length > 0,
    companyId,
    selectedGroup,
    availableCodes: currencies,
    currentCode: currencyCode,
    onApplyCode: applyCrossPageCurrency,
  });

  const handleCurrencyChange = useCallback(
    (code) => {
      if (skipNextCurrencyClickRef.current) {
        skipNextCurrencyClickRef.current = false;
        return;
      }
      setShowAllCurrencies(false);
      setCurrencyCode(code);
      persistCrossPageCurrency(code);
    },
    [persistCrossPageCurrency],
  );

  const handleCurrencyDropOn = useCallback(
    async (e, targetCode) => {
      e.preventDefault();
      const dragged = e.dataTransfer?.getData("text/plain");
      if (!dragged || !targetCode || dragged === targetCode) return;
      const list = [...currencies];
      const fromI = list.indexOf(dragged);
      const toI = list.indexOf(targetCode);
      if (fromI < 0 || toI < 0 || fromI === toI) return;
      skipNextCurrencyClickRef.current = true;
      const next = [...list];
      const [moved] = next.splice(fromI, 1);
      next.splice(toI, 0, moved);
      setCurrencies(next);
      const orderCompanyId = resolveCurrencyOrderCompanyId();
      if (orderCompanyId != null) {
        currenciesByCompanyRef.current.set(orderCompanyId, next);
      }
      if (selectedGroup) {
        currenciesByGroupRef.current.set(String(selectedGroup).trim().toUpperCase(), next);
      }
      try {
        await saveUserCurrencyOrder(next, { companyId: orderCompanyId ?? undefined });
      } catch {
        /* Keep local order even if save fails. */
      }
    },
    [currencies, resolveCurrencyOrderCompanyId, selectedGroup]
  );

  return {
    me,
    loadError,
    companyAccessModal,
    closeCompanyAccessModal,
    companiesForPicker,
    groupIds,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    mergedSubsetIds,
    companyId,
    currencies,
    currencyCode: displayCurrencyCode,
    showAllCurrencies,
    canShowAllCurrencies,
    handleToggleAllCurrencies,
    handleCurrencyChange,
    handleCurrencyDropOn,
    loading: kpiLoading,
    dashboardData,
    kpi,
    kpiCompareLabel,
    kpiFooter,
    chartRows,
    chartSeries,
    chartVisible,
    toggleChartSeries,
    chartDateRangeText,
    chartXAxisLayout,
    earningsCurrencyRows,
    useConvertedEarnings,
    earningsBreakdownShowsRate,
    summaryEarningsValue,
    summaryConversionNote,
    summaryEarningsLoading,
    earningsByCurrencyLoading,
    exchangeRates,
    exchangeRatesError,
    exchangeRatesLoading,
    rateFootnoteText,
    convertedEarningsTotal,
    handlePickGroup,
    handlePickAllGroups,
    handlePickCompany,
    handlePickAllInGroup,
  };
}
