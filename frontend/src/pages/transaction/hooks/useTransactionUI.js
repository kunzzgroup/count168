import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getHistory, loadContraInbox, approveContra, rejectContra } from "../transactionApi.js";

export function useTransactionUI() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState([]);
  const [history, setHistory] = useState({ open: false, title: "", rows: [], loading: false });
  const [contraInbox, setContraInbox] = useState({ open: false, loading: false, items: [] });
  const closeToastTimer = useRef(null);

  const pushToast = useCallback((message, type = "info") => {
    setToast((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }];
      return next.slice(-2);
    });
    if (closeToastTimer.current) clearTimeout(closeToastTimer.current);
    closeToastTimer.current = setTimeout(() => {
      setToast((prev) => prev.slice(1));
    }, 2500);
  }, []);

  const paymentHistoryTitle = useCallback((row, accountMeta) => {
    const code = String(accountMeta?.account_id ?? row?.account_id ?? "").trim();
    const name = String(accountMeta?.name ?? row?.account_name ?? code ?? "").trim() || code;
    return `Payment History - ${code} (${name})`;
  }, []);

  const onViewHistory = useCallback(
    async (row, dateFrom, dateTo, companyId) => {
      if (!row || !companyId) return;
      const title = paymentHistoryTitle(row, null);
      setHistory({ open: true, title, rows: [], loading: true });
      try {
        const accountDbId = row.account_db_id ? String(row.account_db_id) : "";
        const currency = String(row.currency || "").toUpperCase().trim();
        const res = await queryClient.fetchQuery({
          queryKey: ["tx-history", Number(companyId), accountDbId, String(dateFrom || ""), String(dateTo || ""), currency],
          queryFn: ({ signal }) =>
            getHistory({
              companyId,
              accountId: accountDbId,
              dateFrom,
              dateTo,
              currency,
              signal,
            }),
          staleTime: 30_000,
          gcTime: 5 * 60_000,
        });
        if (res?.success) {
          const rows = Array.isArray(res.data) ? res.data : [];
          const nextTitle = res.account ? paymentHistoryTitle(row, res.account) : title;
          setHistory((s) => ({ ...s, rows, loading: false, title: nextTitle }));
        } else {
          pushToast(res?.message || "Failed to load history", "error");
          setHistory((s) => ({ ...s, loading: false }));
        }
      } catch (e) {
        pushToast(e.message, "error");
        setHistory((s) => ({ ...s, loading: false }));
      }
    },
    [pushToast, paymentHistoryTitle, queryClient],
  );

  const refreshContraInboxBadge = useCallback(
    async (companyId) => {
      if (!companyId) return;
      try {
        const res = await loadContraInbox({ companyId });
        if (res?.success) {
          setContraInbox((s) => ({ ...s, items: Array.isArray(res.data) ? res.data : [] }));
        }
      } catch {
        /* ignore */
      }
    },
    [setContraInbox],
  );

  const onApproveContra = useCallback(
    async (id, companyId, onSearch) => {
      if (!id || !companyId) return;
      try {
        const res = await approveContra({ transactionId: id, companyId });
        if (res?.success) {
          pushToast("Contra approved", "success");
          refreshContraInboxBadge(companyId);
          if (onSearch) onSearch();
        } else {
          pushToast(res?.message || "Failed to approve contra", "error");
        }
      } catch (e) {
        pushToast(e.message, "error");
      }
    },
    [pushToast, refreshContraInboxBadge],
  );

  const onRejectContra = useCallback(
    async (id, companyId) => {
      if (!id || !companyId) return;
      try {
        const res = await rejectContra({ transactionId: id, companyId });
        if (res?.success) {
          pushToast("Contra rejected", "success");
          refreshContraInboxBadge(companyId);
        } else {
          pushToast(res?.message || "Failed to reject contra", "error");
        }
      } catch (e) {
        pushToast(e.message, "error");
      }
    },
    [pushToast, refreshContraInboxBadge],
  );

  return {
    toast,
    setToast,
    pushToast,
    history,
    setHistory,
    contraInbox,
    setContraInbox,
    onViewHistory,
    refreshContraInboxBadge,
    onApproveContra,
    onRejectContra,
  };
}
