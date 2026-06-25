import { isC168CompanyRow, isBankOnlyCompanyRow } from "../../../utils/company/c168CaptureChannel.js";
import { findOwnerCompanyById } from "../../../utils/company/sharedCompanyFilter.js";

function resolveScopeCompanyRow(companies, companyId, scope) {
  const id =
    companyId != null && companyId !== ""
      ? Number(companyId)
      : Number(scope?.uiCompanyId ?? scope?.scopeCompanyId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (Array.isArray(companies)) {
    const fromList = companies.find((c) => Number(c.id) === id);
    if (fromList) return fromList;
  }
  return findOwnerCompanyById(id);
}

/** C168 / bank-only (e.g. CX): company payroll channel flags for maintenance APIs & process lists. */
export function enrichMaintenancePayrollScope(scope, companies, companyId = null) {
  if (!scope) return scope;
  const row = resolveScopeCompanyRow(companies, companyId, scope);
  if (!row) return scope;
  if (isC168CompanyRow(row)) {
    return { ...scope, c168Channel: true, companyPayrollChannel: true };
  }
  if (isBankOnlyCompanyRow(row)) {
    return { ...scope, companyPayrollChannel: true };
  }
  return scope;
}
