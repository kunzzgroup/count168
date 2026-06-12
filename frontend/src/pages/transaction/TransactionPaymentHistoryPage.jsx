import { useLayoutEffect, useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import TransactionHistoryTable from "./components/TransactionHistoryTable.jsx";
import { AccountingReportContainer, AccountingReportPage } from "../../components/report/AccountingReportTable.jsx";
import { formatHistoryMoney } from "./lib/transactionFormat.js";
import { getHistory, transactionQueryKeys } from "./lib/transactionApi.js";
import {
  paymentHistoryParamsReady,
  paymentHistoryTitle,
  resolveHistoryAccountName,
  resolvePaymentHistoryScope,
  paymentHistoryScopeApiParams,
} from "./lib/transactionPaymentHistoryUrl.js";
import { TRANSACTION_SHOW_DESCRIPTION_COLUMN } from "./lib/transactionPaymentPageUtils.js";
import "../../../public/css/transaction.css";
import "./transactionPaymentHistoryPage.css";
import { useLoginLang } from "../../utils/i18n/useLoginLang.js";
import { TRANSACTION_I18N } from "../../translateFile/pages/transactionTranslate.js";
import { clearInlineScrollLock } from "../../utils/layout/clearInlineScrollLock.js";

export default function TransactionPaymentHistoryPage() {
  const [searchParams] = useSearchParams();
  const scope = useMemo(() => resolvePaymentHistoryScope(searchParams), [searchParams]);
  const lang = useLoginLang();
  const m = useMemo(() => TRANSACTION_I18N[lang] || TRANSACTION_I18N.en, [lang]);

  useLayoutEffect(() => {
    document.body.classList.add("dashboard-page", "transaction-page", "transaction-payment-history-page");
    clearInlineScrollLock();
    return () => {
      document.body.classList.remove("transaction-page", "transaction-payment-history-page", "page-ready");
    };
  }, []);

  const initialTitle = useMemo(
    () =>
      paymentHistoryTitle({
        accountCode: scope.accountCode,
        accountName: scope.accountName,
      }),
    [scope.accountCode, scope.accountName],
  );

  const scopeApi = useMemo(() => paymentHistoryScopeApiParams(scope), [scope]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: transactionQueryKeys.history({
      companyId: scopeApi.companyId,
      viewGroup: scopeApi.viewGroup,
      groupId: scopeApi.groupId,
      groupAggregate: scopeApi.groupAggregate,
      accountDbId: scope.accountDbId,
      dateFrom: scope.dateFrom,
      dateTo: scope.dateTo,
      currency: scope.currency,
      virtualCompanyCode: scope.virtualCompanyCode,
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
    enabled: paymentHistoryParamsReady(scope),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  if (!paymentHistoryParamsReady(scope)) {
    return <Navigate to="/transaction" replace />;
  }

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
  const errorMessage = isError ? error?.message || "Failed to load history" : data?.success === false ? data?.message : null;

  return (
    <div className="transaction-payment-history-page-root">
      <AccountingReportPage>
        <AccountingReportContainer className="transaction-payment-history-report">
          <div className="transaction-modal-content transaction-history-modal transaction-payment-history-panel">
            <div className="transaction-modal-header">
              <h3 id="modal_title">{title}</h3>
            </div>
            <div className="transaction-modal-body" style={{ position: "relative" }}>
              {isLoading ? (
                <div
                  className="transaction-tables-loading"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.75)",
                    zIndex: 2,
                  }}
                  aria-live="polite"
                >
                  {m.loadingHistory}
                </div>
              ) : null}
              {errorMessage ? (
                <p className="transaction-payment-history-error" role="alert">
                  {errorMessage}
                </p>
              ) : (
                <TransactionHistoryTable
                  rows={rows}
                  histMoney={formatHistoryMoney}
                  showDescriptionColumn={TRANSACTION_SHOW_DESCRIPTION_COLUMN}
                  m={m}
                />
              )}
            </div>
          </div>
        </AccountingReportContainer>
      </AccountingReportPage>
    </div>
  );
}
