import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as transactionMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as transactionMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as transactionMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolveTransactionMaintenanceScope,
};

/** Group entity scope: SALARY / BONUS only (aligned with Capture Maintenance). */
export function transactionMaintenanceUsesGroupProcesses(scope) {
  return scope?.mode === "group";
}

/** Query params for transaction maintenance search / delete APIs. */
export function transactionMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  const base = customerReportScopeApiParams(scope);
  return {
    ...base,
    reportScope: scope.mode,
  };
}
