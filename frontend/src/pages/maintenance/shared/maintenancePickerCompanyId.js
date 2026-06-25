/**
 * Pill highlight id: prefer numeric id when it exists in visible pills,
 * else match by company code (dedupe / session row may use a different id).
 */
export function resolveMaintenancePickerCompanyId(companyId, companyCode, visibleCompanies) {
  const list = Array.isArray(visibleCompanies) ? visibleCompanies : [];
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0 && list.some((c) => Number(c.id) === cid)) {
    return cid;
  }
  const code = normalizeMaintenanceCompanyCode(companyCode);
  if (code) {
    const byCode = list.find(
      (c) => normalizeMaintenanceCompanyCode(c.company_id) === code,
    );
    if (byCode?.id != null) return Number(byCode.id);
  }
  return Number.isFinite(cid) && cid > 0 ? cid : null;
}

/** Normalize owner-companies row code for pill matching. */
export function normalizeMaintenanceCompanyCode(code) {
  return String(code ?? "").trim().toUpperCase();
}

/** Resolve display code for pill highlight when booting from session / another page. */
export function resolvePickerCompanyCode(companyId, companies, sessionUser = null) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return "";
  const list = Array.isArray(companies) ? companies : [];
  const row = list.find((c) => Number(c.id) === cid);
  if (row?.company_id != null && String(row.company_id).trim() !== "") {
    return String(row.company_id).trim();
  }
  const sid = Number(sessionUser?.company_id);
  if (Number.isFinite(sid) && sid === cid) {
    const fromSession = sessionUser?.company_code ?? sessionUser?.companyCode;
    if (fromSession != null && String(fromSession).trim() !== "") {
      return String(fromSession).trim();
    }
  }
  return "";
}
