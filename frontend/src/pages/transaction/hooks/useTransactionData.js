import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import {
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  fetchOwnerCompaniesAll,
  clearDashboardGroupFilterKeepCompany,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  notifyDashboardGroupFilterChanged,
  persistDashboardGroupFilter,
  resolveBootCompanyId,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  readPersistedDashboardGcFilter,
  resolveCompanyPickWhenSwitchingGroup,
  resolveCompanyWhenClosingGroup,
  resolveGcFilterBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
  isCompanyLogin,
} from "../../../utils/company/loginScope.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { syncCompanySessionInBackground } from "../../../utils/company/companySessionSwitchCore.js";
import {
  getAccounts,
  getCategories,
  getCompanyCurrencies,
  getUserCurrencyOrder,
  transactionQueryKeys,
} from "../lib/transactionApi.js";
import { isPartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";
import { orderCurrencyRows } from "../lib/transactionPaymentLogic.js";
import {
  resolveTransactionScope,
  transactionScopeApiParams,
  transactionScopeCacheKey,
} from "../lib/transactionScope.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { buildTransactionCompanyStripRows } from "../lib/transactionCompanyStrip.js";

export function useTransactionData({
  todayDmy,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me: u, sessionReady } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filterSnapshot, setFilterSnapshot] = useState(null);
  const [categories, setCategories] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  /** scopeKey + rows updated atomically — restore never sees stale rows for a new company. */
  const [currencyScopeBundle, setCurrencyScopeBundle] = useState({ scopeKey: null, rows: [] });
  const filterSnapshotRef = useRef(null);
  const scopeSwitchSeqRef = useRef(0);
  const scopeCacheKeyRef = useRef("");
  const bootOnceRef = useRef(false);
  const companySessionAbortRef = useRef(null);

  const commitFilterSnapshot = useCallback((nextSnap) => {
    filterSnapshotRef.current = nextSnap;
    setFilterSnapshot(nextSnap);
  }, []);

  const transactionScope = useMemo(
    () => resolveTransactionScope(filterSnapshot),
    [filterSnapshot],
  );
  const scopeCacheKey = transactionScopeCacheKey(transactionScope);
  const prevScopeCacheKeyRef = useRef(scopeCacheKey);

  useEffect(() => {
    scopeCacheKeyRef.current = scopeCacheKey;
  }, [scopeCacheKey]);

  useEffect(() => {
    filterSnapshotRef.current = filterSnapshot;
  }, [filterSnapshot]);

  useLayoutEffect(() => {
    if (prevScopeCacheKeyRef.current === scopeCacheKey) return;
    prevScopeCacheKeyRef.current = scopeCacheKey;
    scopeCacheKeyRef.current = scopeCacheKey;
    queryClient.removeQueries({ queryKey: ["tx-company-currencies"] });
    setAccountOptions([]);
    setCurrencyOptions([]);
    setCurrencyScopeBundle({ scopeKey: null, rows: [] });
  }, [scopeCacheKey, queryClient]);

  const setCurrencyRowsOrdered = useCallback((next) => {
    setCurrencyScopeBundle((prev) => ({
      ...prev,
      rows: typeof next === "function" ? next(prev.rows) : next,
    }));
  }, []);

  const currencyRowsOrdered = currencyScopeBundle.rows;

  const syncPickerCompanySession = useCallback(
    async (companyId, seq) => {
      const cid = Number(companyId);
      if (!Number.isFinite(cid) || cid <= 0) return;
      companySessionAbortRef.current?.abort();
      const ac = new AbortController();
      companySessionAbortRef.current = ac;
      try {
        await syncCompanySessionInBackground({
          companyId: cid,
          sessionCompanyId: u?.company_id,
          signal: ac.signal,
          layoutSilent: true,
        });
      } catch (e) {
        if (e?.name === "AbortError" || isCancelledError(e)) return;
        console.error(e);
      } finally {
        if (companySessionAbortRef.current === ac) {
          companySessionAbortRef.current = null;
        }
      }
      if (seq !== scopeSwitchSeqRef.current) return;
    },
    [u?.company_id],
  );

  useEffect(() => {
    if (!sessionReady) return;
    if (!u) {
      bootOnceRef.current = false;
      navigate("/login", { replace: true });
      return;
    }

    if (bootOnceRef.current && filterSnapshotRef.current) {
      setFilterSnapshot((prev) =>
        prev
          ? {
              ...prev,
              viewerRole: String(u.role || "").toLowerCase(),
              mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
            }
          : prev,
      );
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canPay = hasFull || perms.includes("payment");
        if (!canPay) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const rows = await fetchOwnerCompaniesAll();

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const persisted = readPersistedDashboardGcFilter();
        const bootGc = resolveGcFilterBootCompanyId({
          urlCompanyId: queryCompany,
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
          me: u,
          companies: rows,
        });
        let effective = bootGc.companyId;
        const snapRows = dedupeOwnerCompaniesByCode(rows, effective ?? u.company_id);

        if (
          effective != null &&
          queryCompany &&
          rows.some((c) => Number(c.id) === Number(queryCompany))
        ) {
          const sj = await syncCompanySessionApi(queryCompany);
          if (!sj?.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          } else {
            notifyCompanySessionUpdated();
          }
        }

        const current =
          effective != null ? snapRows.find((c) => Number(c.id) === Number(effective)) : null;
        const selGroup =
          bootGc.selectedGroup ||
          persisted.selectedGroup ||
          resolveInitialSelectedGroupFromSession(snapRows, current, u);

        const allowBootGroupOnly = canUseGroupOnlyMode(u, selGroup);
        let bootGroupOnly = (bootGc.groupOnly || effective == null) && allowBootGroupOnly;
        if (!bootGroupOnly && effective == null && selGroup) {
          const pick = pickDefaultSubsidiaryForGroup(snapRows, selGroup, {
            me: u,
            preferredCompanyId: u?.company_id ?? null,
          });
          if (pick?.id) {
            effective = Number(pick.id);
          }
        }

        let bootCompanyId = bootGroupOnly ? null : effective;
        let bootDisplayRow = bootGroupOnly
          ? null
          : effective != null
            ? snapRows.find((c) => Number(c.id) === Number(effective)) ?? current
            : current;

        if (isCompanyLogin(u) && selGroup && (bootGroupOnly || bootCompanyId == null)) {
          const pick =
            resolveCompanyPickWhenSwitchingGroup(snapRows, selGroup, bootCompanyId ?? u.company_id) ??
            pickDefaultSubsidiaryForGroup(snapRows, selGroup, {
              me: u,
              preferredCompanyId: bootCompanyId ?? u.company_id,
            });
          if (pick?.id) {
            bootGroupOnly = false;
            bootCompanyId = Number(pick.id);
            bootDisplayRow = pick;
          }
        }

        if (bootGroupOnly) {
          persistDashboardGroupOnlyMode(true);
        } else {
          persistDashboardGroupOnlyMode(false);
        }

        if (!cancelled && !filterSnapshotRef.current) {
          const bootSnap = {
            companyId: bootCompanyId,
            groupOnlyLedger: bootGroupOnly,
            selectedGroup: selGroup,
            displayCompanyRow: bootDisplayRow,
            groupsAllMode: false,
            groupAllMode: false,
            snapCompanies: snapRows,
            snapCompaniesAll: rows,
            snapGroupIds: sortedUniqueGroupIds(snapRows),
            viewerRole: String(u.role || "").toLowerCase(),
            mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
          };
          bootSnap.companyStripRows = buildTransactionCompanyStripRows(bootSnap, {
            selectedGroup: selGroup,
            companyId: bootCompanyId,
            groupsAllMode: false,
          });
          bootOnceRef.current = true;
          setFilterSnapshot(bootSnap);
        } else if (!cancelled) {
          bootOnceRef.current = true;
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, u, navigate]);

  useEffect(() => {
    if (!sessionReady || !u) return;
    const refreshSessionFlags = () => {
      setFilterSnapshot((prev) =>
        prev
          ? {
              ...prev,
              viewerRole: String(u.role || "").toLowerCase(),
              mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
            }
          : prev,
      );
    };
    const onCompanySession = () => {
      refreshSessionFlags();
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    return () => window.removeEventListener("eazycount:company-session-updated", onCompanySession);
  }, [sessionReady, u]);

  useEffect(() => {
    if (loading || forbidden || !transactionScope) return;
    if (
      transactionScope.mode === "group" &&
      !canUseGroupOnlyMode(u, transactionScope.selectedGroup)
    ) {
      setAccountOptions([]);
      setCurrencyOptions([]);
      setCurrencyScopeBundle({ scopeKey: scopeCacheKey, rows: [] });
      return;
    }
    const fetchScopeKey = scopeCacheKey;
    let cancelled = false;
    const scopeApi = transactionScopeApiParams(transactionScope);
    const orderCompanyId =
      transactionScope?.mode === "company" && transactionScope.scopeCompanyId > 0
        ? transactionScope.scopeCompanyId
        : undefined;
    (async () => {
      try {
        const c = await queryClient.fetchQuery({
          queryKey: transactionQueryKeys.categories(),
          queryFn: () => getCategories(),
          staleTime: 5 * 60_000,
          gcTime: 30 * 60_000,
        });
        const roles = Array.isArray(c?.data) ? c.data : Array.isArray(c) ? c : [];
        if (!cancelled) setCategories(roles.map((r) => String(r).toUpperCase()));
      } catch {
        if (!cancelled) setCategories([]);
      }

      try {
        const ord = await queryClient.fetchQuery({
          queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCompanyId ?? ""],
          queryFn: ({ signal }) => getUserCurrencyOrder({ companyId: orderCompanyId, signal }),
          staleTime: 60_000,
          gcTime: 10 * 60_000,
        });

        let accData = [];
        let curRows = [];
        if (transactionScope.mode === "aggregate" && transactionScope.mergeCompanyIds?.length) {
          const ids = transactionScope.mergeCompanyIds;
          const accResults = await Promise.all(
            ids.map((cid) =>
              queryClient.fetchQuery({
                queryKey: transactionQueryKeys.accounts(`${scopeCacheKey}:${cid}`),
                queryFn: ({ signal }) => getAccounts({ companyId: cid, signal }),
                staleTime: 60_000,
              }),
            ),
          );
          const curResults = await Promise.all(
            ids.map((cid) =>
              queryClient.fetchQuery({
                queryKey: transactionQueryKeys.companyCurrencies(`${scopeCacheKey}:${cid}`),
                queryFn: ({ signal }) => getCompanyCurrencies({ companyId: cid, signal }),
                staleTime: 60_000,
              }),
            ),
          );
          const accMap = new Map();
          for (const r of accResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const id = Number(row?.id);
              if (Number.isFinite(id) && id > 0) accMap.set(id, row);
            }
          }
          accData = [...accMap.values()];
          const curSet = new Map();
          for (const r of curResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const code = String(row?.code || row?.currency || "").toUpperCase().trim();
              if (code) curSet.set(code, row);
            }
          }
          curRows = [...curSet.values()];
        } else if (
          transactionScope.mode === "aggregate" &&
          transactionScope.aggregateGroupIds?.length
        ) {
          const gids = transactionScope.aggregateGroupIds;
          const accResults = await Promise.all(
            gids.map((gid) =>
              queryClient.fetchQuery({
                queryKey: transactionQueryKeys.accounts(`${scopeCacheKey}:group:${gid}`),
                queryFn: ({ signal }) => getAccounts({ groupId: gid, signal }),
                staleTime: 60_000,
              }),
            ),
          );
          const accMap = new Map();
          for (const r of accResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const id = Number(row?.id);
              if (Number.isFinite(id) && id > 0) accMap.set(id, row);
            }
          }
          accData = [...accMap.values()];
          const snap = filterSnapshotRef.current?.snapCompaniesAll || filterSnapshotRef.current?.snapCompanies || [];
          const ids = filterCompaniesWithDisplayId(snap)
            .map((c) => Number(c.id))
            .filter((id) => Number.isFinite(id) && id > 0);
          const curResults = await Promise.all(
            ids.map((cid) =>
              queryClient.fetchQuery({
                queryKey: transactionQueryKeys.companyCurrencies(`${scopeCacheKey}:${cid}`),
                queryFn: ({ signal }) => getCompanyCurrencies({ companyId: cid, signal }),
                staleTime: 60_000,
              }),
            ),
          );
          const curSet = new Map();
          for (const r of curResults) {
            for (const row of Array.isArray(r?.data) ? r.data : []) {
              const code = String(row?.code || row?.currency || "").toUpperCase().trim();
              if (code) curSet.set(code, row);
            }
          }
          curRows = [...curSet.values()];
        } else {
          const [acc, cur] = await Promise.all([
            queryClient.fetchQuery({
              queryKey: transactionQueryKeys.accounts(scopeCacheKey),
              queryFn: ({ signal }) => getAccounts({ ...scopeApi, signal }),
              staleTime: 60_000,
              gcTime: 10 * 60_000,
            }),
            queryClient.fetchQuery({
              queryKey: transactionQueryKeys.companyCurrencies(scopeCacheKey),
              queryFn: ({ signal }) => getCompanyCurrencies({ ...scopeApi, signal }),
              staleTime: 60_000,
              gcTime: 10 * 60_000,
            }),
          ]);
          accData = Array.isArray(acc?.data) ? acc.data : [];
          curRows = Array.isArray(cur?.data) ? cur.data : [];
        }
        if (cancelled || fetchScopeKey !== scopeCacheKeyRef.current) return;
        const ordered = orderCurrencyRows(curRows, ord);
        const codes = ordered.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);
        setAccountOptions(accData);
        setCurrencyScopeBundle({ scopeKey: fetchScopeKey, rows: ordered });
        setCurrencyOptions([...new Set(codes)]);
      } catch {
        if (!cancelled && fetchScopeKey === scopeCacheKeyRef.current) {
          setAccountOptions([]);
          setCurrencyOptions([]);
          setCurrencyScopeBundle({ scopeKey: null, rows: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, scopeCacheKey, todayDmy, queryClient, transactionScope, u]);

  useEffect(() => {
    if (!filterSnapshot) return;
    notifyDashboardGroupFilterChanged(filterSnapshot.selectedGroup, filterSnapshot.companyId);
  }, [filterSnapshot?.selectedGroup, filterSnapshot?.companyId]);

  useGroupAnchorSessionSync({
    companies: filterSnapshot?.snapCompanies ?? [],
    selectedGroup: filterSnapshot?.selectedGroup,
    companyId: filterSnapshot?.companyId,
    enabled: Boolean(filterSnapshot),
  });

  const applyGroupOnlySelection = useCallback(async (snap, groupId) => {
    const g = String(groupId || "").trim().toUpperCase();
    if (!g || !snap) return;

    const seq = ++scopeSwitchSeqRef.current;
    const url = new URL(window.location.href);
    url.searchParams.delete("company_id");
    window.history.replaceState(null, "", url.toString());

    const nextSnap = {
      ...snap,
      selectedGroup: g,
      companyId: null,
      groupOnlyLedger: true,
      displayCompanyRow: null,
      groupsAllMode: false,
      groupAllMode: false,
    };
    nextSnap.companyStripRows = buildTransactionCompanyStripRows(nextSnap, {
      selectedGroup: g,
      companyId: null,
      groupsAllMode: false,
    });
    const scope = resolveTransactionScope(nextSnap);

    persistDashboardGroupOnlyMode(true);
    persistDashboardFilterState(g, null);
    commitFilterSnapshot(nextSnap);

    if (scope?.scopeCompanyId > 0) {
      void syncPickerCompanySession(scope.scopeCompanyId, seq);
    }
  }, [commitFilterSnapshot, syncPickerCompanySession]);

  const applyDeselectGroupSelection = useCallback(
    async (snap) => {
      if (!snap) return;

      const seq = ++scopeSwitchSeqRef.current;
      const companies = snap.snapCompaniesAll || snap.snapCompanies || [];
      const groupIds = snap.snapGroupIds || sortedUniqueGroupIds(companies);
      const pick = resolveCompanyWhenClosingGroup(companies, snap.companyId, groupIds);
      const numericCid = pick?.id != null ? Number(pick.id) : null;

      const url = new URL(window.location.href);
      if (numericCid != null && numericCid > 0) {
        url.searchParams.set("company_id", String(numericCid));
      } else {
        url.searchParams.delete("company_id");
      }
      window.history.replaceState(null, "", url.toString());

      persistDashboardGroupOnlyMode(false);
      if (numericCid != null && numericCid > 0) {
        clearDashboardGroupFilterKeepCompany(numericCid);
      } else {
        sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
        persistDashboardGroupFilter(null);
        persistDashboardFilterState(null, null, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(null, null);
      }

      const nextSnap = {
        ...snap,
        selectedGroup: null,
        companyId: numericCid,
        groupOnlyLedger: false,
        displayCompanyRow: pick ?? null,
        groupsAllMode: false,
        groupAllMode: false,
      };
      nextSnap.companyStripRows = buildTransactionCompanyStripRows(nextSnap, {
        selectedGroup: null,
        companyId: numericCid,
        groupsAllMode: false,
      });
      commitFilterSnapshot(nextSnap);

      if (numericCid == null || numericCid <= 0) return;

      const nextScope = resolveTransactionScope(nextSnap);
      const nextScopeKey = transactionScopeCacheKey(nextScope);
      const prefetchApi = transactionScopeApiParams(nextScope) || {
        companyId: numericCid,
        subsidiaryAccountsOnly: true,
      };
      const orderCompanyId =
        nextScope?.mode === "company" && nextScope.scopeCompanyId > 0
          ? nextScope.scopeCompanyId
          : undefined;

      void Promise.all([
        queryClient.prefetchQuery({
          queryKey: transactionQueryKeys.accounts(nextScopeKey),
          queryFn: ({ signal }) => getAccounts({ ...prefetchApi, signal }),
          staleTime: 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: transactionQueryKeys.companyCurrencies(nextScopeKey),
          queryFn: ({ signal }) => getCompanyCurrencies({ ...prefetchApi, signal }),
          staleTime: 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCompanyId ?? ""],
          queryFn: ({ signal }) => getUserCurrencyOrder({ companyId: orderCompanyId, signal }),
          staleTime: 60_000,
        }),
      ]);

      void syncPickerCompanySession(numericCid, seq);
    },
    [commitFilterSnapshot, queryClient, syncPickerCompanySession],
  );

  const applyCompanyGroupSelection = useCallback(
    async (snap, groupId) => {
      const g = String(groupId || "").trim().toUpperCase();
      if (!g || !snap) return;

      const seq = ++scopeSwitchSeqRef.current;
      const companies = snap.snapCompaniesAll || snap.snapCompanies || [];
      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, snap.companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, {
          me: u,
          preferredCompanyId: snap.companyId ?? u?.company_id,
        }) ??
        pickDefaultCompanyForGroup(companies, g, {
          me: u,
          preferredCompanyId: snap.companyId ?? u?.company_id,
          nativeOnly: true,
        });
      if (!pick?.id) {
        if (!canUseGroupOnlyMode(u)) {
          const nextSnap = {
            ...snap,
            selectedGroup: g,
            groupsAllMode: false,
            groupAllMode: false,
          };
          nextSnap.companyStripRows = buildTransactionCompanyStripRows(nextSnap, {
            selectedGroup: g,
            companyId: snap.companyId,
            groupsAllMode: false,
          });
          persistDashboardGroupFilter(g);
          persistDashboardGroupOnlyMode(false);
          persistDashboardFilterState(g, snap.companyId, { allowGroupOnly: false });
          commitFilterSnapshot(nextSnap);
          return;
        }
        await applyGroupOnlySelection(snap, g);
        return;
      }

      const numericCid = Number(pick.id);
      const viewGroup = resolveViewGroupForCompany(pick, g);
      const nextSnap = {
        ...snap,
        companyId: numericCid,
        groupOnlyLedger: false,
        selectedGroup: g,
        displayCompanyRow: pick,
        groupsAllMode: false,
        groupAllMode: false,
      };
      nextSnap.companyStripRows = buildTransactionCompanyStripRows(nextSnap, {
        selectedGroup: g,
        companyId: numericCid,
        groupsAllMode: false,
      });
      const nextScope = resolveTransactionScope(nextSnap);
      const nextScopeKey = transactionScopeCacheKey(nextScope);
      const prefetchApi = transactionScopeApiParams(nextScope) || {
        companyId: numericCid,
        viewGroup,
        subsidiaryAccountsOnly: true,
      };
      const orderCompanyId =
        nextScope?.mode === "company" && nextScope.scopeCompanyId > 0
          ? nextScope.scopeCompanyId
          : undefined;

      const url = new URL(window.location.href);
      url.searchParams.set("company_id", String(numericCid));
      window.history.replaceState(null, "", url.toString());
      persistDashboardGroupFilter(g);
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(g, numericCid, { allowGroupOnly: false });
      commitFilterSnapshot(nextSnap);

      void Promise.all([
        queryClient.prefetchQuery({
          queryKey: transactionQueryKeys.accounts(nextScopeKey),
          queryFn: ({ signal }) => getAccounts({ ...prefetchApi, signal }),
          staleTime: 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: transactionQueryKeys.companyCurrencies(nextScopeKey),
          queryFn: ({ signal }) => getCompanyCurrencies({ ...prefetchApi, signal }),
          staleTime: 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCompanyId ?? ""],
          queryFn: ({ signal }) => getUserCurrencyOrder({ companyId: orderCompanyId, signal }),
          staleTime: 60_000,
        }),
      ]);

      void syncPickerCompanySession(numericCid, seq);
    },
    [applyGroupOnlySelection, commitFilterSnapshot, queryClient, syncPickerCompanySession, u],
  );

  const onCompanyButtonClick = useCallback(
    (comp) => {
      const cid = comp.id;
      if (!cid) return;
      const snap = filterSnapshotRef.current;
      if (!snap) return;
      if (Number(cid) === Number(snap.companyId)) {
        if (isCompanyLogin(u)) return;
        const gid = comp.group_id ? String(comp.group_id).toUpperCase().trim() : snap.selectedGroup;
        if (!canUseGroupOnlyMode(u, gid || snap.selectedGroup)) return;
        void applyGroupOnlySelection(snap, gid || snap.selectedGroup);
        return;
      }

      const seq = ++scopeSwitchSeqRef.current;
      const numericCid = Number(cid);
      const gid = comp.group_id ? String(comp.group_id).toUpperCase().trim() : null;
      const nextGroup = gid || snap.selectedGroup;
      const nextGroupNorm = String(nextGroup || "").trim().toUpperCase();
      const currGroupNorm = String(snap.selectedGroup || "").trim().toUpperCase();
      const viewGroup = resolveViewGroupForCompany(comp, nextGroup);
      const stripUnchanged =
        nextGroupNorm === currGroupNorm &&
        Array.isArray(snap.companyStripRows) &&
        snap.companyStripRows.length > 0;
      const nextSnap = {
        ...snap,
        companyId: numericCid,
        groupOnlyLedger: false,
        selectedGroup: nextGroup || snap.selectedGroup,
        displayCompanyRow: comp,
        groupsAllMode: false,
        groupAllMode: false,
        companyStripRows: stripUnchanged
          ? snap.companyStripRows
          : buildTransactionCompanyStripRows(
              { ...snap, selectedGroup: nextGroup || snap.selectedGroup },
              {
                selectedGroup: nextGroup || snap.selectedGroup,
                companyId: numericCid,
                groupsAllMode: false,
              },
            ),
      };
      const nextScope = resolveTransactionScope(nextSnap);
      const nextScopeKey = transactionScopeCacheKey(nextScope);
      const prefetchApi = transactionScopeApiParams(nextScope) || {
        companyId: numericCid,
        viewGroup,
        subsidiaryAccountsOnly: true,
      };
      const orderCompanyId =
        nextScope?.mode === "company" && nextScope.scopeCompanyId > 0
          ? nextScope.scopeCompanyId
          : undefined;

      const url = new URL(window.location.href);
      url.searchParams.set("company_id", String(cid));
      window.history.replaceState(null, "", url.toString());
      if (gid) persistDashboardGroupFilter(gid);
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(nextGroup, numericCid);
      commitFilterSnapshot(nextSnap);

      void Promise.all([
        queryClient.prefetchQuery({
          queryKey: transactionQueryKeys.accounts(nextScopeKey),
          queryFn: ({ signal }) => getAccounts({ ...prefetchApi, signal }),
          staleTime: 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: transactionQueryKeys.companyCurrencies(nextScopeKey),
          queryFn: ({ signal }) => getCompanyCurrencies({ ...prefetchApi, signal }),
          staleTime: 60_000,
        }),
        queryClient.prefetchQuery({
          queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCompanyId ?? ""],
          queryFn: ({ signal }) => getUserCurrencyOrder({ companyId: orderCompanyId, signal }),
          staleTime: 60_000,
        }),
      ]);

      void syncPickerCompanySession(cid, seq);
    },
    [applyGroupOnlySelection, commitFilterSnapshot, queryClient, syncPickerCompanySession, u],
  );

  const onGroupButtonClick = useCallback(
    async (gid) => {
      const snap = filterSnapshotRef.current;
      if (!snap) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      const allowGroupOnly = canUseGroupOnlyMode(u, g);

      // Re-click active group: deselect when company login or group-only is not allowed.
      if (g === snap.selectedGroup && !snap.groupsAllMode) {
        if (isCompanyLogin(u) || !allowGroupOnly) {
          await applyDeselectGroupSelection(snap);
          return;
        }
        if (snap.companyId == null || Number(snap.companyId) <= 0) return;
        await applyGroupOnlySelection(snap, g);
        return;
      }

      // Company login: switching group must include a subsidiary (never group-only ledger).
      if (isCompanyLogin(u)) {
        await applyCompanyGroupSelection(snap, g);
        return;
      }

      if (allowGroupOnly) {
        await applyGroupOnlySelection(snap, g);
      } else {
        await applyCompanyGroupSelection(snap, g);
      }
    },
    [applyCompanyGroupSelection, applyDeselectGroupSelection, applyGroupOnlySelection, u],
  );

  const onPickAllGroups = useCallback(() => {
    const snap = filterSnapshotRef.current;
    if (!snap || snap.groupsAllMode) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("company_id");
    window.history.replaceState(null, "", url.toString());
    persistDashboardGroupFilter(null);
    persistDashboardFilterState(null, null);
    persistDashboardGroupOnlyMode(false);
    notifyDashboardGroupFilterChanged(null, null);
    setFilterSnapshot({
      ...snap,
      groupsAllMode: true,
      groupAllMode: false,
      groupOnlyLedger: false,
      selectedGroup: null,
      companyId: null,
      displayCompanyRow: null,
      companyStripRows: buildTransactionCompanyStripRows(
        { ...snap, groupsAllMode: true },
        { selectedGroup: null, companyId: null, groupsAllMode: true },
      ),
    });
  }, []);

  useLayoutEffect(() => {
    if (loading || forbidden || !filterSnapshot || !isCompanyLogin(u)) return;
    if (filterSnapshot.groupsAllMode || filterSnapshot.groupAllMode) return;
    if (!filterSnapshot.selectedGroup || filterSnapshot.companyId != null) return;

    const companies = filterSnapshot.snapCompaniesAll || filterSnapshot.snapCompanies || [];
    const pick =
      pickDefaultSubsidiaryForGroup(companies, filterSnapshot.selectedGroup, {
        me: u,
        preferredCompanyId: u?.company_id,
      }) ??
      pickDefaultCompanyForGroup(companies, filterSnapshot.selectedGroup, {
        me: u,
        preferredCompanyId: u?.company_id,
        nativeOnly: true,
      });
    if (!pick?.id) return;

    void applyCompanyGroupSelection(filterSnapshot, filterSnapshot.selectedGroup);
  }, [
    applyCompanyGroupSelection,
    filterSnapshot,
    forbidden,
    loading,
    u,
  ]);

  const onPickAllInGroup = useCallback(() => {
    const snap = filterSnapshotRef.current;
    if (!snap || (snap.groupAllMode && !snap.companyId)) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("company_id");
    window.history.replaceState(null, "", url.toString());
    persistDashboardGroupOnlyMode(false);
    persistDashboardFilterState(snap.groupsAllMode ? null : snap.selectedGroup, null);
    notifyDashboardGroupFilterChanged(snap.groupsAllMode ? null : snap.selectedGroup, null);
    setFilterSnapshot({
      ...snap,
      groupAllMode: true,
      groupOnlyLedger: false,
      companyId: null,
      displayCompanyRow: null,
      companyStripRows: buildTransactionCompanyStripRows(snap, {
        selectedGroup: snap.selectedGroup,
        companyId: null,
        groupsAllMode: snap.groupsAllMode,
      }),
    });
  }, []);

  return {
    loading,
    setLoading,
    forbidden,
    setForbidden,
    filterSnapshot,
    setFilterSnapshot,
    transactionScope,
    categories,
    setCategories,
    accountOptions,
    setAccountOptions,
    currencyOptions,
    setCurrencyOptions,
    currencyRowsOrdered,
    currencyScopeBundle,
    setCurrencyRowsOrdered,
    onGroupButtonClick,
    onCompanyButtonClick,
    onPickAllGroups,
    onPickAllInGroup,
    allowCompanyDeselect:
      !isCompanyLogin(u) && canClearCompanySelection(u, filterSnapshot?.selectedGroup),
  };
}
