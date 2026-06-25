import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";
import { enrichMaintenancePayrollScope } from "../shared/maintenancePayrollScope.js";

export {
  customerReportScopeIsReady as transactionMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as transactionMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as transactionMaintenanceScopeCacheKey,
};

export function resolveTransactionMaintenanceScope({
  companies,
  selectedGroup,
  companyId,
  groupsAllMode = false,
  groupAllMode = false,
}) {
  const base = resolveCustomerReportScope({
    companies,
    selectedGroup,
    companyId,
    groupsAllMode,
    groupAllMode,
  });
  return enrichMaintenancePayrollScope(base, companies, companyId);
}

/** Group entity or company payroll channel (C168 / bank-only): SALARY / BONUS process list. */
export function transactionMaintenanceUsesGroupProcesses(scope) {
  if (!scope) return false;
  if (scope.c168Channel || scope.companyPayrollChannel) return true;
  return scope.mode === "group";
}

/** Query params for transaction maintenance search / delete APIs. */
export function transactionMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  if (scope.c168Channel || scope.companyPayrollChannel) {
    const companyId = scope.scopeCompanyId ?? scope.uiCompanyId ?? undefined;
    return {
      companyId,
      viewGroup: scope.viewGroup || scope.groupId || undefined,
      reportScope: "company",
    };
  }
  const base = customerReportScopeApiParams(scope);
  const out = {
    ...base,
    reportScope: scope.mode,
  };
  if (scope.mode === "group") {
    out.groupOnly = true;
    out.groupAggregate = true;
  }
  return out;
}
