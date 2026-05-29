import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as paymentMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as paymentMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as paymentMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolvePaymentMaintenanceScope,
};

/** Query params for payment maintenance search / delete APIs (company scope only). */
export function paymentMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  const base = customerReportScopeApiParams(scope);
  return {
    ...base,
    reportScope: scope.mode,
  };
}
