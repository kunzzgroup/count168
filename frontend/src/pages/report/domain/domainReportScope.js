import {
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../shared/reportScope.js";

/** Domain Report: fixed SALARY/BONUS process list only for these group tabs. */
export const DOMAIN_SALARY_BONUS_GROUP_IDS = ["AP", "IG"];

export function isDomainSalaryBonusGroup(groupId) {
  const g = String(groupId || "")
    .trim()
    .toUpperCase();
  return DOMAIN_SALARY_BONUS_GROUP_IDS.includes(g);
}

/** Same scope rules as Customer Report; subsidiaries stay company mode. */
export function resolveDomainReportScope(args) {
  return resolveCustomerReportScope(args);
}

/** Fixed SALARY/BONUS dropdown only on AP/IG group entity (or group-only), not subsidiaries. */
export function domainReportUsesSalaryBonusProcesses(scope) {
  return scope?.mode === "group" && isDomainSalaryBonusGroup(scope.groupId);
}

export { customerReportScopeIsReady as domainReportScopeIsReady };
