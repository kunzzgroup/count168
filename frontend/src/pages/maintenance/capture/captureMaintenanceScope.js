import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as captureMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as captureMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as captureMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolveCaptureMaintenanceScope,
};

/** Group entity scope: SALARY / BONUS only (aligned with Data Capture / Summary). */
export function captureMaintenanceUsesGroupProcesses(scope) {
  return scope?.mode === "group";
}

/** Query params for capture maintenance search / delete APIs. */
export function captureMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  const base = customerReportScopeApiParams(scope);
  return {
    ...base,
    reportScope: scope.mode,
  };
}
