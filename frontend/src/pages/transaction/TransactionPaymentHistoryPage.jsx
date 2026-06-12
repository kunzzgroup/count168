import { useLayoutEffect, useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import TransactionHistoryTable from "./components/TransactionHistoryTable.jsx";
import { formatHistoryMoney } from "./lib/transactionFormat.js";
import { getHistory, transactionQueryKeys } from "./lib/transactionApi.js";
import {
  parsePaymentHistoryParams,
  paymentHistoryParamsReady,
  paymentHistoryTitle,
  resolveHistoryAccountName,
} from "./lib/transactionPaymentHistoryUrl.js";
import { TRANSACTION_SHOW_DESCRIPTION_COLUMN } from "./lib/transactionPaymentPageUtils.js";
import "../../../public/css/transaction.css";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { TRANSACTION_I18N } from "../../translateFile/pages/transactionTranslate.js";
import { clearInlineScrollLock } from "../../utils/layout/clearInlineScrollLock.js";

export default function TransactionPaymentHistoryPage() {
  const [searchParams] = useSearchParams();
  const params = useMemo(() => parsePaymentHistoryParams(searchParams), [searchParams]);
  const lang = useLoginLang();
  const m = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);

  useLayoutEffect(() => {
    document.body.classList.add("transaction-payment-history-page");
    clearInlineScrollLock();
    return () => {
      document.body.classList.remove("transaction-payment-history-page", "page-ready");
    };
  }, []);

  const initialTitle = useMemo(
    () =>
      paymentHistoryTitle({
        accountCode: params.accountCode,
        accountName: params.accountName,
      }),
    [params.accountCode, params.accountName],
  );

  const scopeApi = useMemo(
    () => ({
      companyId: params.companyId,
      viewGroup: params.viewGroup,
      groupId: params.groupId,
      groupAggregate: params.groupAggregate,
    }),
    [params.companyId, params.viewGroup, params.groupId, params.groupAggregate],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: transactionQueryKeys.history({
      companyId: scopeApi.companyId,
      viewGroup: scopeApi.viewGroup,
      groupId: scopeApi.groupId,
      groupAggregate: scopeApi.groupAggregate,
      accountDbId: params.accountDbId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      currency: params.currency,
      virtualCompanyCode: params.virtualCompanyCode,
    }),
    queryFn: ({ signal }) =>
      getHistory({
        ...scopeApi,
        accountId: params.accountDbId,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        currency: params.currency,
        virtualCompanyCode: params.virtualCompanyCode,
        signal,
      }),
    enabled: paymentHistoryParamsReady(params),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  if (!paymentHistoryParamsReady(params)) {
    return <Navigate to="/transaction" replace />;
  }

  const rows = data?.success && Array.isArray(data.data) ? data.data : [];
  const accountMeta = data?.account
    ? {
        ...data.account,
        name: resolveHistoryAccountName({
          accountName: params.accountName,
          accountMeta: data.account,
          accountCode: params.accountCode,
        }),
      }
    : null;
  const title = accountMeta
    ? paymentHistoryTitle({
        accountCode: params.accountCode,
        accountName: params.accountName,
        accountMeta,
      })
    : initialTitle;
  const errorMessage = isError ? error?.message || "Failed to load history" : data?.success === false ? data?.message : null;

  return (
    <div className="transaction-payment-history-page-root">
      <header className="transaction-payment-history-header">
        <h1 className="transaction-payment-history-title">{title}</h1>
      </header>
      <div className="transaction-payment-history-body">
        {isLoading ? (
          <div className="transaction-payment-history-loading" aria-live="polite">
            {m.loadingHistory}
          </div>
        ) : null}
        {errorMessage ? (
          <p className="transaction-payment-history-error" role="alert">
            {errorMessage}
          </p>
        ) : (
          <div className="transaction-history-modal transaction-payment-history-table-shell">
            <div className="transaction-modal-body">
              <TransactionHistoryTable
                rows={rows}
                histMoney={formatHistoryMoney}
                showDescriptionColumn={TRANSACTION_SHOW_DESCRIPTION_COLUMN}
                m={m}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
