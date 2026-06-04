import {
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../shared/reportScope.js";

/** Same scope rules as Customer Report; subsidiaries stay company mode. */
export function resolveDomainReportScope(args) {
  return resolveCustomerReportScope(args);
}

/** Group entity / group-only: SALARY + BONUS only (aligned with Data Capture). */
export function domainReportUsesSalaryBonusProcesses(scope) {
  return scope?.mode === "group";
}

export { customerReportScopeIsReady as domainReportScopeIsReady };
