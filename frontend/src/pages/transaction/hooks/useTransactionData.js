import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import {
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  normalizeOwnerCompanyRow,
  notifyDashboardGroupFilterChanged,
  persistDashboardGroupFilter,
  resolveBootCompanyId,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  resolveInitialSelectedGroupFromSession,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
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

async function syncSessionToScopeCompany(scopeCompanyId) {
  if (!scopeCompanyId) return false;
  const res = await fetch(
    buildApiUrl(`api/session/update_company_session_api.php?company_id=${scopeCompanyId}`),
    { credentials: "include" },
  );
  const sj = await res.json();
  if (!res.ok || !sj.success) return false;
  notifyCompanySessionUpdated();
  return true;
}

export function useTransactionData({
  todayDmy,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filterSnapshot, setFilterSnapshot] = useState(null);
  const [categories, setCategories] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [currencyRowsOrdered, setCurrencyRowsOrdered] = useState([]);
  const currencyInitCompanyRef = useRef(null);
  const filterSnapshotRef = useRef(null);

  const transactionScope = useMemo(
    () => resolveTransactionScope(filterSnapshot),
    [filterSnapshot],
  );
  const scopeCacheKey = transactionScopeCacheKey(transactionScope);
  const prevScopeCacheKeyRef = useRef(scopeCacheKey);

  useEffect(() => {
    filterSnapshotRef.current = filterSnapshot;
  }, [filterSnapshot]);

  useLayoutEffect(() => {
    if (prevScopeCacheKeyRef.current === scopeCacheKey) return;
    prevScopeCacheKeyRef.current = scopeCacheKey;
    setAccountOptions([]);
    setCurrencyOptions([]);
    setCurrencyRowsOrdered([]);
    currencyInitCompanyRef.current = null;
    queryClient.removeQueries({ queryKey: ["tx-accounts"] });
    queryClient.removeQueries({ queryKey: ["tx-company-currencies"] });
  }, [scopeCacheKey, queryClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
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
        const canPay = hasFull || perms.includes("payment");
        if (!canPay) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const companiesJson = await companiesRes.json();
        const rawRows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        const rows = rawRows.map((r) => normalizeOwnerCompanyRow(r)).filter(Boolean);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = resolveBootCompanyId({
          urlCompanyId: queryCompany,
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });

        const snapRows = dedupeOwnerCompaniesByCode(rows, effective ?? u.company_id);

        if (
          effective != null &&
          queryCompany &&
          rows.some((c) => Number(c.id) === Number(queryCompany))
        ) {
          const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${queryCompany}`), {
            credentials: "include",
          });
          const sj = await sync.json();
          if (!sync.ok || !sj.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          } else {
            notifyCompanySessionUpdated();
          }
        }

        const current =
          effective != null ? snapRows.find((c) => Number(c.id) === Number(effective)) : null;
        const selGroup = resolveInitialSelectedGroupFromSession(snapRows, current);

        if (!cancelled) {
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            groupsAllMode: false,
            groupAllMode: false,
            snapCompanies: snapRows,
            snapCompaniesAll: rows,
            snapGroupIds: sortedUniqueGroupIds(snapRows),
            viewerRole: String(u.role || "").toLowerCase(),
            mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
          });
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
  }, [navigate]);

  useEffect(() => {
    const refreshSessionFlags = async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) return;
        const u = meJson.data;
        setFilterSnapshot((prev) =>
          prev
            ? {
                ...prev,
                viewerRole: String(u.role || "").toLowerCase(),
                mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
              }
            : prev,
        );
      } catch {
        // ignore transient refresh failures
      }
    };
    const onCompanySession = () => {
      void refreshSessionFlags();
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    return () => window.removeEventListener("eazycount:company-session-updated", onCompanySession);
  }, []);

  useEffect(() => {
    if (loading || forbidden || !transactionScope) return;
    let cancelled = false;
    const scopeApi = transactionScopeApiParams(transactionScope);
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
          queryKey: transactionQueryKeys.userCurrencyOrder(),
          queryFn: ({ signal }) => getUserCurrencyOrder({ signal }),
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
        if (cancelled) return;
        setAccountOptions(accData);
        const ordered = orderCurrencyRows(curRows, ord);
        setCurrencyRowsOrdered(ordered);
        const codes = ordered.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);
        setCurrencyOptions([...new Set(codes)]);
      } catch {
        if (!cancelled) {
          setAccountOptions([]);
          setCurrencyOptions([]);
          setCurrencyRowsOrdered([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, scopeCacheKey, todayDmy, queryClient, transactionScope]);

  useLayoutEffect(() => {
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

    const url = new URL(window.location.href);
    url.searchParams.delete("company_id");
    window.history.replaceState(null, "", url.toString());

    const nextSnap = {
      ...snap,
      selectedGroup: g,
      companyId: null,
      groupsAllMode: false,
      groupAllMode: false,
    };
    const scope = resolveTransactionScope(nextSnap);
    if (scope?.scopeCompanyId > 0) await syncSessionToScopeCompany(scope.scopeCompanyId);

    persistDashboardGroupOnlyMode(true);
    persistDashboardFilterState(g, null);
    notifyDashboardGroupFilterChanged(g, null);
    setFilterSnapshot(nextSnap);
  }, []);

  const onCompanyButtonClick = useCallback(
    async (comp) => {
      const cid = comp.id;
      if (!cid) return;
      const snap = filterSnapshotRef.current;
      if (snap && Number(cid) === Number(snap.companyId)) {
        const gid = comp.group_id ? String(comp.group_id).toUpperCase().trim() : snap.selectedGroup;
        await applyGroupOnlySelection(snap, gid || snap.selectedGroup);
        return;
      }
      try {
        const numericCid = Number(cid);
        const gid = comp.group_id ? String(comp.group_id).toUpperCase().trim() : null;
        const nextGroup = gid || snap?.selectedGroup;
        const viewGroup = resolveViewGroupForCompany(comp, nextGroup);
        const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${cid}`), {
          credentials: "include",
        });
        const sj = await res.json();
        if (res.ok && sj.success) {
          notifyCompanySessionUpdated();

          const nextSnap = {
            ...snap,
            companyId: numericCid,
            selectedGroup: nextGroup || snap?.selectedGroup,
            groupsAllMode: false,
            groupAllMode: false,
          };
          const nextScope = resolveTransactionScope(nextSnap);
          const nextScopeKey = transactionScopeCacheKey(nextScope);
          const prefetchApi = transactionScopeApiParams(nextScope) || {
            companyId: numericCid,
            viewGroup,
          };

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
              queryKey: transactionQueryKeys.userCurrencyOrder(),
              queryFn: ({ signal }) => getUserCurrencyOrder({ signal }),
              staleTime: 60_000,
            }),
          ]);

          const url = new URL(window.location.href);
          url.searchParams.set("company_id", String(cid));
          window.history.replaceState(null, "", url.toString());
          if (gid) persistDashboardGroupFilter(gid);
          persistDashboardGroupOnlyMode(false);
          persistDashboardFilterState(nextGroup, numericCid);
          setFilterSnapshot((prev) =>
            prev ? { ...prev, companyId: numericCid, selectedGroup: nextGroup || prev.selectedGroup } : prev,
          );
        }
      } catch (e) {
        if (e?.name === "AbortError" || isCancelledError(e)) return;
        console.error(e);
      }
    },
    [applyGroupOnlySelection, queryClient],
  );

  const onGroupButtonClick = useCallback(
    async (gid) => {
      const snap = filterSnapshotRef.current;
      if (!snap) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      // Same group + subsidiary selected: treat as "back to group view" (e.g. AP → C168 → AP).
      if (g === snap.selectedGroup && !snap.groupsAllMode) {
        if (snap.companyId == null || Number(snap.companyId) <= 0) return;
        await applyGroupOnlySelection(snap, g);
        return;
      }

      await applyGroupOnlySelection(snap, g);
    },
    [applyGroupOnlySelection],
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
      selectedGroup: null,
      companyId: null,
    });
  }, []);

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
      companyId: null,
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
    setCurrencyRowsOrdered,
    currencyInitCompanyRef,
    onGroupButtonClick,
    onCompanyButtonClick,
    onPickAllGroups,
    onPickAllInGroup,
  };
}
