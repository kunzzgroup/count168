import { isC168CompanyRow, isBankOnlyCompanyRow } from "../../../utils/company/c168CaptureChannel.js";
import { companyMatchesBankOnlyPillScope } from "../../../utils/company/companyCategoryFlags.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";
import { findOwnerCompanyById } from "../../../utils/company/sharedCompanyFilter.js";

function resolveScopeCompanyId(companyId, scope) {
  const id =
    companyId != null && companyId !== ""
      ? Number(companyId)
      : Number(scope?.uiCompanyId ?? scope?.scopeCompanyId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function resolveScopeCompanyRow(companies, companyId, scope) {
  const id = resolveScopeCompanyId(companyId, scope);
  if (!id) return null;
  if (Array.isArray(companies)) {
    const fromList = companies.find((c) => Number(c.id) === id);
    if (fromList) return fromList;
  }
  return findOwnerCompanyById(id);
}

function isPayrollChannelCompany(row, numericCompanyId) {
  if (row && isC168CompanyRow(row)) return true;
  if (row && (isBankOnlyCompanyRow(row) || companyMatchesBankOnlyPillScope(row))) {
    return true;
  }
  const cached =
    numericCompanyId != null ? peekCompanySessionFlags(numericCompanyId) : null;
  if (cached?.has_bank && !cached?.has_gambling) return true;
  return false;
}

/** C168 / bank-only (e.g. CX, TEST02): company payroll channel flags for maintenance APIs & process lists. */
export function enrichMaintenancePayrollScope(scope, companies, companyId = null) {
  if (!scope) return scope;
  const numericCompanyId = resolveScopeCompanyId(companyId, scope);
  const row = resolveScopeCompanyRow(companies, companyId, scope);
  if (!isPayrollChannelCompany(row, numericCompanyId)) return scope;
  if (row && isC168CompanyRow(row)) {
    return { ...scope, c168Channel: true, companyPayrollChannel: true };
  }
  return { ...scope, companyPayrollChannel: true };
}
