import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../../utils/companySessionEvents.js";
import {
  getAccounts,
  getCategories,
  getCompanyCurrencies,
  getUserCurrencyOrder,
} from "../transactionApi.js";
import { transactionQueryKeys } from "../transactionQueryKeys.js";
import { orderCurrencyRows, readTransactionCurrencyFilterState } from "../transactionPaymentLogic.js";

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

  // Initial authentication and company list loading
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
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        if (queryCompany && rows.some((c) => Number(c.id) === Number(queryCompany))) {
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

        const current = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && current?.group_id && String(current.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && current?.group_id?.trim()) {
          selGroup = String(current.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

        if (!cancelled) {
          const snapRows = rows.filter((c) => c.company_id && String(c.company_id).trim() !== "");
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            snapCompanies: snapRows,
            snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
            viewerRole: String(u.role || "").toLowerCase(),
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
    if (loading || forbidden || !filterSnapshot) return;
    let cancelled = false;
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
        const cid = filterSnapshot.companyId;
        const [acc, cur, ord] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: transactionQueryKeys.accounts(cid),
            queryFn: ({ signal }) => getAccounts({ companyId: cid, signal }),
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          }),
          queryClient.fetchQuery({
            queryKey: transactionQueryKeys.companyCurrencies(cid),
            queryFn: ({ signal }) => getCompanyCurrencies({ companyId: cid, signal }),
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          }),
          queryClient.fetchQuery({
            queryKey: transactionQueryKeys.userCurrencyOrder(),
            queryFn: ({ signal }) => getUserCurrencyOrder({ signal }),
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          }),
        ]);
        if (cancelled) return;
        setAccountOptions(Array.isArray(acc?.data) ? acc.data : []);
        const rawCur = Array.isArray(cur?.data) ? cur.data : [];
        const ordered = orderCurrencyRows(rawCur, ord);
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
  }, [
    loading,
    forbidden,
    filterSnapshot,
    todayDmy,
    queryClient,
    setCategories,
    setAccountOptions,
    setCurrencyOptions,
    setCurrencyRowsOrdered,
  ]);

  const onGroupButtonClick = useCallback((gid) => {
    setFilterSnapshot((prev) => {
      if (!prev) return prev;
      const next = prev.selectedGroup === gid ? null : gid;
      if (next) sessionStorage.setItem("dashboard_group_filter", next);
      else sessionStorage.removeItem("dashboard_group_filter");
      return { ...prev, selectedGroup: next };
    });
  }, []);

  const onCompanyButtonClick = useCallback(
    async (comp) => {
      const cid = comp.id;
      if (!cid) return;
      try {
        const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${cid}`), {
          credentials: "include",
        });
        const sj = await res.json();
        if (res.ok && sj.success) {
          notifyCompanySessionUpdated();
          const numericCid = Number(cid);

          // Warm up next-company data before switching state to reduce list refresh latency.
          void Promise.all([
            queryClient.prefetchQuery({
              queryKey: transactionQueryKeys.accounts(numericCid),
              queryFn: ({ signal }) => getAccounts({ companyId: numericCid, signal }),
              staleTime: 60_000,
            }),
            queryClient.prefetchQuery({
              queryKey: transactionQueryKeys.companyCurrencies(numericCid),
              queryFn: ({ signal }) => getCompanyCurrencies({ companyId: numericCid, signal }),
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
          setFilterSnapshot((prev) => (prev ? { ...prev, companyId: numericCid } : prev));
        }
      } catch (e) {
        console.error(e);
      }
    },
    [queryClient],
  );

  return {
    loading,
    setLoading,
    forbidden,
    setForbidden,
    filterSnapshot,
    setFilterSnapshot,
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
  };
}

