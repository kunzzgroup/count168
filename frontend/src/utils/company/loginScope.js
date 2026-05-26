/**
 * Group vs Company login scope — mirrors {@link includes/group_company_access.php}.
 */
import { readAccessibleGroupIds } from "./sharedCompanyFilter.js";

export const LOGIN_SCOPE_GROUP = "group";
export const LOGIN_SCOPE_COMPANY = "company";

export function normalizeLoginScope(scope) {
  const s = String(scope || "").trim().toLowerCase();
  if (s === LOGIN_SCOPE_GROUP || s === LOGIN_SCOPE_COMPANY) return s;
  return null;
}

export function getLoginScope(me) {
  return normalizeLoginScope(me?.login_scope);
}

export function getLoginIdentifier(me) {
  const id = String(me?.login_identifier || "").trim().toUpperCase();
  return id || null;
}

export function isGroupLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_GROUP;
}

export function isCompanyLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_COMPANY;
}

/** Native group of login company (default GroupID on boot). */
export function resolveCompanyLoginGroupId(me, companies = []) {
  if (!isCompanyLogin(me)) return null;
  const fromSession = me?.login_group_id;
  if (fromSession != null && String(fromSession).trim() !== "") {
    return String(fromSession).trim().toUpperCase();
  }
  const ident = getLoginIdentifier(me);
  if (!ident) return null;
  const row = (companies || []).find(
    (c) => String(c.company_id || "").trim().toUpperCase() === ident
  );
  const gid = row?.group_id ? String(row.group_id).trim().toUpperCase() : null;
  return gid || null;
}

/** Company login: keep full owner list (AP+IG when linked). Group login: that group only. */
export function companyMatchesLoginScope(company, me) {
  const scope = getLoginScope(me);
  const ident = getLoginIdentifier(me);
  if (!scope || !ident || !company) return true;

  if (scope === LOGIN_SCOPE_COMPANY) return true;

  const gid = String(company.group_id || "").trim().toUpperCase();
  return gid === ident;
}

export function filterCompaniesForLoginScope(companies, me) {
  if (!Array.isArray(companies) || !getLoginScope(me)) return companies || [];
  if (isCompanyLogin(me)) return companies;
  return companies.filter((c) => companyMatchesLoginScope(c, me));
}

export function canUseGroupOnlyMode(me) {
  return isGroupLogin(me);
}

export function canClearCompanySelection(me) {
  return isGroupLogin(me);
}

/**
 * Group pills: group login → one group; company login → linked groups (AP+IG) from session/API.
 */
export function resolveVisibleGroupIds(groupIds, me) {
  const ids = Array.isArray(groupIds) ? groupIds : [];
  const scope = getLoginScope(me);
  const ident = getLoginIdentifier(me);
  if (!scope || !ident) return ids;

  if (scope === LOGIN_SCOPE_GROUP) {
    return ids.includes(ident) ? [ident] : ident ? [ident] : ids;
  }

  const extra = readAccessibleGroupIds(me);
  const set = new Set([...ids, ...extra]);
  return [...set].sort();
}

export function loginScopeBodyClass(me) {
  if (isGroupLogin(me)) return "ec-login-scope-group";
  if (isCompanyLogin(me)) return "ec-login-scope-company";
  return "";
}
