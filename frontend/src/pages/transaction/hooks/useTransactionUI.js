import { useState, useCallback, useRef } from "react";
import { getHistory, loadContraInbox, approveContra, rejectContra } from "../transactionApi.js";

export function useTransactionUI() {
  const [toast, setToast] = useState([]);
  const [history, setHistory] = useState({ open: false, title: "", rows: [], loading: false });
  const [contraInbox, setContraInbox] = useState({ open: false, loading: false, items: [] });
  const [quickOpen, setQuickOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const closeToastTimer = useRef(null);

  const pushToast = useCallback((message, type = "info") => {
    setToast((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }];
      return next.slice(-2);
    });
    if (closeToastTimer.current) clearTimeout(closeToastTimer.current);
    closeToastTimer.current = setTimeout(() => {
      setToast((prev) => prev.slice(1));
    }, 2000);
  }, []);

  const onViewHistory = useCallback(
    async (row, dateFrom, dateTo, companyId) => {
      if (!row || !companyId) return;
      const title = `${row.account_id} [${row.currency || ""}]`;
      setHistory({ open: true, title, rows: [], loading: true });
      try {
        const res = await getHistory({
          companyId,
          accountId: row.account_db_id,
          dateFrom,
          dateTo,
          currency: row.currency,
        });
        if (res?.success) {
          setHistory((s) => ({ ...s, rows: Array.isArray(res.data) ? res.data : [], loading: false }));
        } else {
          pushToast(res?.message || "Failed to load history", "error");
          setHistory((s) => ({ ...s, loading: false }));
        }
      } catch (e) {
        pushToast(e.message, "error");
        setHistory((s) => ({ ...s, loading: false }));
      }
    },
    [pushToast],
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
    quickOpen,
    setQuickOpen,
    categoryOpen,
    setCategoryOpen,
    onViewHistory,
    refreshContraInboxBadge,
    onApproveContra,
    onRejectContra,
  };
}
