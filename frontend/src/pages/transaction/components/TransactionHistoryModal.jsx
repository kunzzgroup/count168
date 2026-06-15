import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import TransactionHistoryTable from "./TransactionHistoryTable.jsx";
import { formatHistoryMoney } from "../lib/transactionFormat.js";
import { getHistory, transactionQueryKeys } from "../lib/transactionApi.js";
import {
  paymentHistoryParamsReady,
  paymentHistoryScopeApiParams,
  paymentHistoryTitle,
  resolveHistoryAccountName,
} from "../lib/transactionPaymentHistoryUrl.js";
import { TRANSACTION_SHOW_DESCRIPTION_COLUMN } from "../lib/transactionPaymentPageUtils.js";
import "../../../../public/css/portal-tooltip.css";

export default function TransactionHistoryModal({ scope, onClose, m }) {
  const scopeApi = useMemo(() => paymentHistoryScopeApiParams(scope), [scope]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: transactionQueryKeys.history({
      companyId: scopeApi.companyId,
      viewGroup: scopeApi.viewGroup,
      groupId: scopeApi.groupId,
      groupAggregate: scopeApi.groupAggregate,
      accountDbId: scope?.accountDbId,
      dateFrom: scope?.dateFrom,
      dateTo: scope?.dateTo,
      currency: scope?.currency,
      virtualCompanyCode: scope?.virtualCompanyCode,
      subsidiaryAccountsOnly: scopeApi.subsidiaryAccountsOnly,
    }),
    queryFn: ({ signal }) =>
      getHistory({
        ...scopeApi,
        accountId: scope.accountDbId,
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        currency: scope.currency,
        virtualCompanyCode: scope.virtualCompanyCode,
        signal,
      }),
    enabled: Boolean(scope) && paymentHistoryParamsReady(scope),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!scope) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scope, onClose]);

  if (!scope) return null;

  const initialTitle = paymentHistoryTitle({
    accountCode: scope.accountCode,
    accountName: scope.accountName,
  });

  const rows = data?.success && Array.isArray(data.data) ? data.data : [];
  const accountMeta = data?.account
    ? {
        ...data.account,
        name: resolveHistoryAccountName({
          accountName: scope.accountName,
          accountMeta: data.account,
          accountCode: scope.accountCode,
        }),
      }
    : null;
  const title = accountMeta
    ? paymentHistoryTitle({
        accountCode: scope.accountCode,
        accountName: scope.accountName,
        accountMeta,
      })
    : initialTitle;
  const errorMessage = isError
    ? error?.message || "Failed to load history"
    : data?.success === false
      ? data?.message
      : null;

  return (
    <div
      id="historyModal"
      className="transaction-modal"
      style={{ display: "flex" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal_title"
      onClick={handleBackdropClick}
    >
      <div className="transaction-modal-content transaction-history-modal">
        <div className="transaction-modal-header">
          <h3 id="modal_title">{title}</h3>
          <button type="button" className="transaction-modal-close" aria-label={m.close} onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="transaction-modal-body">
          {isLoading ? (
            <p className="transaction-history-modal-loading" aria-live="polite">
              {m.loadingHistory}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="transaction-history-modal-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {!isLoading && !errorMessage ? (
            <TransactionHistoryTable
              rows={rows}
              histMoney={formatHistoryMoney}
              showDescriptionColumn={TRANSACTION_SHOW_DESCRIPTION_COLUMN}
              m={m}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
