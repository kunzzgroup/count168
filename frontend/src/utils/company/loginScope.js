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

/** Linked group ids for filter pills (AP+IG when domain/ownership links). */
export function resolveAccessibleGroupIds(me, companies = []) {
  const fromSession = readAccessibleGroupIds(me);
  const set = new Set(fromSession);
  const ident = getLoginIdentifier(me);
  // Group login: login_identifier is a group id (e.g. AP). Company login: it is a company code — do not add as a group pill.
  if (ident && isGroupLogin(me)) set.add(ident);
  if (isCompanyLogin(me)) {
    const loginGroup = resolveCompanyLoginGroupId(me, companies);
    if (loginGroup) set.add(loginGroup);
  }
  for (const c of companies || []) {
    const g = String(c?.group_id || "").trim().toUpperCase();
    if (g) set.add(g);
    const link = c?.link_source_group ? String(c.link_source_group).trim().toUpperCase() : "";
    if (link) set.add(link);
  }
  return [...set].sort();
}

/** Company login: full owner list. Group login: login group + linked groups (AP+IG). */
export function companyMatchesLoginScope(company, me, companies = []) {
  const scope = getLoginScope(me);
  const ident = getLoginIdentifier(me);
  if (!scope || !company) return true;
  if (!ident && scope !== LOGIN_SCOPE_COMPANY) return true;

  if (scope === LOGIN_SCOPE_COMPANY) return true;

  const gid = String(company.group_id || "").trim().toUpperCase();
  const linkSrc = company.link_source_group
    ? String(company.link_source_group).trim().toUpperCase()
    : "";
  const accessible = resolveAccessibleGroupIds(me, companies);
  if (accessible.length) {
    return accessible.some((g) => g === gid || g === linkSrc);
  }
  return ident != null && (gid === ident || linkSrc === ident);
}

export function filterCompaniesForLoginScope(companies, me) {
  if (!Array.isArray(companies) || !getLoginScope(me)) return companies || [];
  if (isCompanyLogin(me)) return companies;
  return companies.filter((c) => companyMatchesLoginScope(c, me, companies));
}

export function canUseGroupOnlyMode(me) {
  return isGroupLogin(me);
}

export function canClearCompanySelection(me) {
  return isGroupLogin(me);
}

/**
 * Group pills: group/company login → login group + linked groups (AP+IG) from session/API.
 */
export function resolveVisibleGroupIds(groupIds, me, companies = []) {
  const ids = Array.isArray(groupIds) ? groupIds : [];
  const scope = getLoginScope(me);
  if (!scope) return ids;

  const accessible = resolveAccessibleGroupIds(me, companies);
  if (accessible.length) {
    const set = new Set([...ids, ...accessible]);
    return [...set].sort();
  }

  const ident = getLoginIdentifier(me);
  if (scope === LOGIN_SCOPE_GROUP && ident) {
    return ids.includes(ident) ? [ident] : [ident];
  }

  return ids;
}

export function loginScopeBodyClass(me) {
  if (isGroupLogin(me)) return "ec-login-scope-group";
  if (isCompanyLogin(me)) return "ec-login-scope-company";
  return "";
}
