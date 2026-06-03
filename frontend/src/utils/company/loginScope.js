/**
 * Group vs Company login scope — mirrors {@link includes/group_company_access.php}.
 */
import {
  isDashboardGroupOnlyMode,
  readAccessibleGroupIds,
} from "./sharedCompanyFilter.js";

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

/** Company login: clicking an active Group pill collapses Company (Dashboard parity). */
export function canCollapseCompanyOnGroupPill(me) {
  return isGroupLogin(me) || isCompanyLogin(me);
}

/** Mirrors api/c168/c168_domain_access.php c168DomainPageAllowedRoles */
const C168_DOMAIN_PAGE_ROLES = new Set([
  "owner",
  "partnership",
  "admin",
  "manager",
  "supervisor",
  "accountant",
  "audit",
  "customer service",
  "company",
]);

/** Mirrors c168AutoRenewAllowedRoles */
const C168_AUTO_RENEW_ROLES = new Set(["owner", "admin"]);

export function userRoleAllowsC168Domain(role) {
  const r = String(role || "").trim().toLowerCase();
  return C168_DOMAIN_PAGE_ROLES.has(r);
}

export function userRoleAllowsC168AutoRenew(role, userType) {
  if (String(userType || "").trim().toLowerCase() === "member") return false;
  const r = String(role || "").trim().toLowerCase();
  return C168_AUTO_RENEW_ROLES.has(r);
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

/** Normalize company code for sidebar / session patches (empty → null). */
export function normalizeCompanyCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return code || null;
}

/**
 * Optimistic sidebar `me` patch when group/company filter changes (before current_user_api returns).
 * When `companyCode` is supplied in ctx, never fall back to stale `me.company_code` (fixes 95→C168 sidebar).
 */
export function patchMeFromCompanyContext(me, ctx = {}) {
  if (!me) return me;
  const rawId = ctx.companyId;
  const hasExplicitCode = ctx.companyCode != null && String(ctx.companyCode).trim() !== "";
  if (rawId == null || rawId === "" || !Number.isFinite(Number(rawId)) || Number(rawId) <= 0) {
    return {
      ...me,
      is_current_company_c168: false,
      has_c168_domain_page_access: false,
      has_c168_auto_renew_access: false,
      company_code: hasExplicitCode ? normalizeCompanyCode(ctx.companyCode) : "",
    };
  }
  const id = Number(rawId);
  const explicitCode = hasExplicitCode ? normalizeCompanyCode(ctx.companyCode) : null;
  const fallbackCode = normalizeCompanyCode(me.company_code) ?? "";
  const code = hasExplicitCode ? explicitCode ?? "" : fallbackCode;
  const isC168 = code === "C168";
  const next = {
    ...me,
    company_id: id,
    company_code: hasExplicitCode ? code : code || me.company_code,
    is_current_company_c168: isC168,
  };
  if (isC168) {
    if (userRoleAllowsC168Domain(me.role)) {
      next.has_c168_domain_page_access = true;
    }
    if (userRoleAllowsC168AutoRenew(me.role, me.user_type)) {
      next.has_c168_auto_renew_access = true;
    }
  } else {
    next.has_c168_domain_page_access = false;
    next.has_c168_auto_renew_access = false;
  }
  if (ctx.hasGambling != null) next.company_has_gambling = Boolean(ctx.hasGambling);
  if (ctx.hasBank != null) next.company_has_bank = Boolean(ctx.hasBank);
  return next;
}

/** Session / current_user reflects active company (after dashboard company pick + session sync). */
export function isActiveCompanyContextC168(me) {
  if (!me) return false;
  if (me.is_current_company_c168) return true;
  return String(me.company_code || "")
    .trim()
    .toUpperCase() === "C168";
}

/**
 * Domain & Announcement — only while viewing company C168 (any login: group or company).
 * Hidden in group-only dashboard mode (no company selected) even if anchor session is C168.
 */
export function canAccessC168DomainPages(me) {
  if (!me) return false;
  if (isGroupLogin(me) && isDashboardGroupOnlyMode()) return false;
  if (!isActiveCompanyContextC168(me)) return false;
  return userRoleAllowsC168Domain(me.role) || Boolean(me.has_c168_domain_page_access);
}

/** Auto Renew — same rules as Domain / Announcement. */
export function canAccessC168AutoRenew(me) {
  if (!me) return false;
  if (isGroupLogin(me) && isDashboardGroupOnlyMode()) return false;
  if (!isActiveCompanyContextC168(me)) return false;
  return userRoleAllowsC168AutoRenew(me.role, me.user_type) || Boolean(me.has_c168_auto_renew_access);
}
