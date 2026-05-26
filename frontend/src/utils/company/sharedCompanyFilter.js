/**
 * Pure helpers mirroring legacy `js/shared_company_filter.js` + PHP `api/company/company_filter.php` (SSR, unused by SPA).
 * React pages should use these for session key `dashboard_group_filter` and group/company visibility logic.
 *
 * Login scope rules: see `loginScope.js` and `includes/group_company_access.php`.
 */
import {
  canUseGroupOnlyMode,
  filterCompaniesForLoginScope,
  getLoginIdentifier,
  getLoginScope,
  isCompanyLogin,
  isGroupLogin,
} from "./loginScope.js";

export {
  canUseGroupOnlyMode,
  filterCompaniesForLoginScope,
  getLoginIdentifier,
  getLoginScope,
  isCompanyLogin,
  isGroupLogin,
} from "./loginScope.js";

export const DASHBOARD_GROUP_FILTER_KEY = "dashboard_group_filter";
/** Set to "1" when user cleared company but kept a group (group-only mode across pages). */
export const DASHBOARD_GROUP_ONLY_KEY = "dashboard_group_only";
/** Last explicitly selected company id (SPA navigation; overrides stale PHP session when set). */
export const DASHBOARD_SELECTED_COMPANY_KEY = "dashboard_selected_company_id";
/** Prevents re-applying login defaults on refresh while the same login session is active. */
export const DASHBOARD_LOGIN_FILTER_APPLIED_KEY = "dashboard_login_filter_applied";
/** Linked group ids (AP+IG) from get_owner_companies_api for company login filter pills. */
export const DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY = "dashboard_accessible_group_ids";
export const DASHBOARD_GROUP_FILTER_EVENT = "eazycount:dashboard-group-filter-changed";

export function clearDashboardFilterSession() {
  sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_COMPANY_KEY);
  sessionStorage.removeItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY);
  sessionStorage.removeItem(DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY);
}

/** Store linked group ids from companies API (company login: AP+IG). */
export function persistAccessibleGroupIdsFromApi(json) {
  const ids = Array.isArray(json?.accessible_group_ids) ? json.accessible_group_ids : [];
  if (!ids.length) return;
  sessionStorage.setItem(
    DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY,
    JSON.stringify(ids.map((g) => String(g).trim().toUpperCase()).filter(Boolean))
  );
}

export function readAccessibleGroupIds(me) {
  if (Array.isArray(me?.accessible_group_ids) && me.accessible_group_ids.length) {
    return me.accessible_group_ids.map((g) => String(g).trim().toUpperCase()).filter(Boolean);
  }
  try {
    const raw = sessionStorage.getItem(DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((g) => String(g).trim().toUpperCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function buildLoginFilterAppliedKey(me) {
  if (!me?.login_scope || !me?.login_identifier) return null;
  const uid = me.user_id != null ? String(me.user_id) : "";
  const scope = String(me.login_scope).trim().toLowerCase();
  const ident = String(me.login_identifier).trim().toUpperCase();
  if (!uid || !scope || !ident) return null;
  return `${uid}|${scope}|${ident}`;
}

/**
 * Seed dashboard Group / Company sessionStorage from login scope (company code vs group id).
 * @returns {{ selectedGroup: string|null, companyId: number|null, groupOnly: boolean }}
 */
export function seedDashboardFilterFromLogin({
  loginScope,
  loginIdentifier,
  companies = [],
  sessionCompanyId = null,
  sessionCompanyCode = null,
}) {
  const ident = String(loginIdentifier || "").trim().toUpperCase();
  const list = filterCompaniesWithDisplayId(companies);

  if (loginScope === "group" && ident) {
    persistDashboardGroupFilter(ident);
    persistDashboardGroupOnlyMode(true);
    persistDashboardSelectedCompany(null);
    stripCompanyIdFromUrl();
    notifyDashboardGroupFilterChanged(ident, null);
    return { selectedGroup: ident, companyId: null, groupOnly: true };
  }

  if (loginScope === "company" && ident) {
    persistDashboardGroupOnlyMode(false);
  }

  let row = list.find((c) => String(c.company_id || "").trim().toUpperCase() === ident);
  if (!row && sessionCompanyId != null) {
    row = list.find((c) => Number(c.id) === Number(sessionCompanyId));
  }
  if (
    !row &&
    sessionCompanyCode &&
    String(sessionCompanyCode).trim().toUpperCase() === ident &&
    sessionCompanyId != null
  ) {
    row = { id: sessionCompanyId, company_id: sessionCompanyCode, group_id: null };
  }

  const cidRaw = row?.id != null ? Number(row.id) : Number(sessionCompanyId);
  const cid = Number.isFinite(cidRaw) && cidRaw > 0 ? cidRaw : null;
  const group = row?.group_id ? normalizeCompanyGroupId(row) : null;

  persistDashboardGroupOnlyMode(false);
  if (group) persistDashboardGroupFilter(group);
  else sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  if (cid) persistDashboardSelectedCompany(cid);
  else persistDashboardSelectedCompany(null);
  stripCompanyIdFromUrl();
  notifyDashboardGroupFilterChanged(group, cid);

  return { selectedGroup: group, companyId: cid, groupOnly: false };
}

/** Apply login defaults once per login (see {@link buildLoginFilterAppliedKey}). */
export function applyLoginScopeToSessionStorageIfNeeded(me, companies = []) {
  const key = buildLoginFilterAppliedKey(me);
  if (!key || sessionStorage.getItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY) === key) {
    return false;
  }
  seedDashboardFilterFromLogin({
    loginScope: me.login_scope,
    loginIdentifier: me.login_identifier,
    companies,
    sessionCompanyId: me.company_id,
    sessionCompanyCode: me.company_code,
  });
  sessionStorage.setItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY, key);
  return true;
}

export function isDashboardGroupOnlyMode() {
  return sessionStorage.getItem(DASHBOARD_GROUP_ONLY_KEY) === "1";
}

export function persistDashboardGroupOnlyMode(groupOnly) {
  if (groupOnly) sessionStorage.setItem(DASHBOARD_GROUP_ONLY_KEY, "1");
  else sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
}

export function persistDashboardSelectedCompany(companyId) {
  if (companyId == null || companyId === "" || !Number.isFinite(Number(companyId))) {
    sessionStorage.removeItem(DASHBOARD_SELECTED_COMPANY_KEY);
    return;
  }
  sessionStorage.setItem(DASHBOARD_SELECTED_COMPANY_KEY, String(Number(companyId)));
}

export function readDashboardSelectedCompanyId() {
  const saved = sessionStorage.getItem(DASHBOARD_SELECTED_COMPANY_KEY);
  if (saved == null || saved === "") return null;
  const id = Number(saved);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Remove stale `company_id` from the address bar (Admin/Account bookmarked URLs). */
export function stripCompanyIdFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("company_id")) return;
    url.searchParams.delete("company_id");
    const qs = url.searchParams.toString();
    window.history.replaceState(null, "", qs ? `${url.pathname}?${qs}` : url.pathname);
  } catch {
    /* ignore */
  }
}

/**
 * Persist Group / Company filter for cross-page SPA navigation (call on user action only).
 * Cleared company → group-only until user picks a company again.
 */
export function persistDashboardFilterState(selectedGroup, companyId, options = {}) {
  const noCompany = companyId == null || companyId === "";
  const allowGroupOnly = options.allowGroupOnly !== false;

  if (selectedGroup) persistDashboardGroupFilter(selectedGroup);

  if (noCompany) {
    if (!allowGroupOnly) return;
    persistDashboardGroupOnlyMode(true);
    persistDashboardSelectedCompany(null);
    stripCompanyIdFromUrl();
    return;
  }

  persistDashboardGroupOnlyMode(false);
  persistDashboardSelectedCompany(companyId);
}

/** Boot helper: explicit URL company wins; otherwise honour group-only + saved id. */
export function resolveBootCompanyId({ urlCompanyId, sessionCompanyId, defaultRowId } = {}) {
  const urlNum =
    urlCompanyId != null && urlCompanyId !== "" ? Number(urlCompanyId) : Number.NaN;
  if (Number.isFinite(urlNum) && urlNum > 0) return urlNum;
  if (isDashboardGroupOnlyMode()) return null;
  return resolveInitialCompanyId(sessionCompanyId ?? defaultRowId ?? null);
}

/** @deprecated Use {@link persistDashboardFilterState} */
export function syncDashboardGroupOnlyFromFilter(selectedGroup, companyId) {
  persistDashboardFilterState(selectedGroup, companyId);
}

/** Company id for page boot: group-only → null; else saved id, then PHP/fallback. */
export function resolveInitialCompanyId(fallbackCompanyId) {
  if (isDashboardGroupOnlyMode()) return null;
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) return saved;
  if (fallbackCompanyId == null || fallbackCompanyId === "") return null;
  const id = Number(fallbackCompanyId);
  return Number.isFinite(id) ? id : null;
}

/**
 * Notify layout (sidebar Process visibility) when dashboard Group / Company filter changes.
 * Process is hidden only while a group is selected with no company (see AuthenticatedLayout).
 */
export function notifyDashboardGroupFilterChanged(selectedGroup, companyId) {
  const value = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  const groupOnly = isDashboardGroupOnlyMode();
  const cid = groupOnly
    ? null
    : companyId != null && companyId !== "" && Number.isFinite(Number(companyId))
      ? Number(companyId)
      : null;
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_GROUP_FILTER_EVENT, { detail: { selectedGroup: value, companyId: cid } })
  );
}

/** Sidebar Process: hidden when a group is selected and company is cleared (group-only), except on process list routes. */
export function shouldHideSidebarProcess(pathname) {
  if (pathname === "/process-list" || pathname === "/bank-process-list") return false;
  const g = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  return Boolean(String(g || "").trim()) && isDashboardGroupOnlyMode();
}

/** In-memory cache so report/maintenance remounts do not re-block on companies API. */
let ownerCompaniesCache = null;
let ownerCompaniesInflight = null;

function hasOwnerCompaniesCache() {
  return Array.isArray(ownerCompaniesCache) && ownerCompaniesCache.length > 0;
}

export function getCachedOwnerCompanies() {
  return hasOwnerCompaniesCache() ? ownerCompaniesCache : null;
}

export function setCachedOwnerCompanies(rows) {
  if (!Array.isArray(rows)) {
    ownerCompaniesCache = null;
    return;
  }
  const normalized = rows.map(normalizeOwnerCompanyRow).filter(Boolean);
  ownerCompaniesCache = normalized.length > 0 ? normalized : null;
}

/** @param {() => Promise<object[]>} fetcher */
export async function loadOwnerCompaniesCached(fetcher) {
  if (hasOwnerCompaniesCache()) return ownerCompaniesCache;
  if (!ownerCompaniesInflight) {
    ownerCompaniesInflight = fetcher()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const normalized = list.map(normalizeOwnerCompanyRow).filter(Boolean);
        ownerCompaniesCache = normalized.length > 0 ? normalized : null;
        ownerCompaniesInflight = null;
        return ownerCompaniesCache || [];
      })
      .catch((err) => {
        ownerCompaniesInflight = null;
        throw err;
      });
  }
  return ownerCompaniesInflight;
}

/**
 * Normalize keys from `get_owner_companies_api` (and any proxy) so `company_id` / `group_id`
 * match Account List and Maintenance pages — otherwise Transaction filters stay empty.
 */
export function normalizeOwnerCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  const company_id = row.company_id ?? row.companyId ?? row.code ?? "";
  const group_id = row.group_id ?? row.groupId ?? row.group ?? null;
  return {
    ...row,
    company_id,
    group_id,
  };
}

/** One pill per company code; prefer the row matching `preferredCompanyId` when duplicates exist (same as maintenance transaction filters). */
export function dedupeOwnerCompaniesByCode(companies, preferredCompanyId) {
  const list = filterCompaniesWithDisplayId(companies);
  const byCode = new Map();
  const norm = (v) => String(v || "").toUpperCase().trim();
  for (const comp of list) {
    const key = norm(comp.company_id);
    if (!key) continue;
    const existing = byCode.get(key);
    if (!existing) {
      byCode.set(key, comp);
      continue;
    }
    const existingIsCurrent = Number(existing.id) === Number(preferredCompanyId);
    const currentIsCurrent = Number(comp.id) === Number(preferredCompanyId);
    if (!existingIsCurrent && currentIsCurrent) byCode.set(key, comp);
  }
  return Array.from(byCode.values());
}

export function normalizeCompanyGroupId(comp) {
  return String(comp?.group_id ?? "").trim().toUpperCase();
}

/** True when the company row belongs to the selected group (or no group filter is active). */
export function companyBelongsToGroup(companyRow, selectedGroup) {
  if (!companyRow) return false;
  const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (!sel) return true;
  return normalizeCompanyGroupId(companyRow) === sel;
}

/** User explicitly picked a company that matches the current group filter. */
export function isExplicitCompanySelection(companyId, companyRow, selectedGroup) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return companyBelongsToGroup(companyRow, selectedGroup);
}

/** Sorted unique non-empty group ids from company rows. */
export function sortedUniqueGroupIds(companies) {
  const set = new Set();
  for (const c of companies || []) {
    const g = normalizeCompanyGroupId(c);
    if (g) set.add(g);
  }
  return [...set].sort();
}

export function persistDashboardGroupFilter(selectedGroup) {
  if (selectedGroup) sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, selectedGroup);
  else sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
}

/**
 * Boot-time resolution (matches transaction/maintenance pages): honour session only when it matches current company's group.
 */
export function resolveInitialSelectedGroupFromSession(companies, currentCompany, loginMe = null) {
  const savedRaw = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  const savedGroup = savedRaw ? String(savedRaw).trim().toUpperCase() : null;
  const groups = sortedUniqueGroupIds(companies);
  let selGroup = null;

  if (
    loginMe?.login_scope === "group" &&
    loginMe?.login_identifier &&
    groups.includes(String(loginMe.login_identifier).trim().toUpperCase())
  ) {
    const g = String(loginMe.login_identifier).trim().toUpperCase();
    sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, g);
    return g;
  }

  if (isDashboardGroupOnlyMode() && savedGroup && groups.includes(savedGroup)) {
    return savedGroup;
  }

  if (
    savedGroup &&
    groups.includes(savedGroup) &&
    currentCompany?.group_id &&
    normalizeCompanyGroupId(currentCompany) === savedGroup
  ) {
    selGroup = savedGroup;
  } else if (savedGroup && !groups.includes(savedGroup)) {
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
    sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
    sessionStorage.removeItem(DASHBOARD_SELECTED_COMPANY_KEY);
  }
  if (!selGroup && currentCompany?.group_id?.trim()) {
    selGroup = normalizeCompanyGroupId(currentCompany);
    sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, selGroup);
  }
  return selGroup;
}

export function filterCompaniesWithDisplayId(companies) {
  return (companies || []).filter((c) => c?.company_id && String(c.company_id).trim() !== "");
}

/**
 * Default company when switching GroupID. Company login must never stay empty.
 * Prefers login company code, then current selection, then first in group.
 */
export function pickDefaultCompanyForGroup(companies, groupId, options = {}) {
  const { me = null, preferredCompanyId = null, preferredCompanyCode = null } = options;
  const list = companiesInGroupList(companies, groupId);
  if (!list.length) return null;

  const loginCode =
    preferredCompanyCode || (me ? getLoginIdentifier(me) : null);
  if (loginCode) {
    const code = String(loginCode).trim().toUpperCase();
    const byLogin = list.find(
      (c) => String(c.company_id || "").trim().toUpperCase() === code
    );
    if (byLogin) return byLogin;
  }

  if (preferredCompanyId != null) {
    const byId = list.find((c) => Number(c.id) === Number(preferredCompanyId));
    if (byId) return byId;
  }

  return list[0] ?? null;
}

/** Companies visible in the Company row when a GroupID is selected (Dashboard-aligned). */
export function companiesInGroupList(companies, gid) {
  if (!gid) {
    return filterCompaniesWithDisplayId(companies).filter((c) => !normalizeCompanyGroupId(c));
  }
  const g = String(gid).trim().toUpperCase();
  return filterCompaniesWithDisplayId(companies).filter((c) => {
    if (normalizeCompanyGroupId(c) === g) return true;
    const linkSrc = c.link_source_group
      ? String(c.link_source_group).trim().toUpperCase()
      : "";
    return linkSrc === g;
  });
}

/**
 * Legacy group-button click: toggle off → independent companies + first independent active;
 * select group → first company in that group active.
 * @returns {{ selectedGroup: string|null, companyToActivate: object|null }}
 */
export function applySharedGroupButtonClick({ clickedGroupId, currentSelectedGroup, companies }) {
  const gid = String(clickedGroupId || "").trim().toUpperCase();
  const list = filterCompaniesWithDisplayId(companies);

  if (currentSelectedGroup === gid) {
    const independents = list.filter((c) => !normalizeCompanyGroupId(c));
    const first = independents[0] ?? null;
    return { selectedGroup: null, companyToActivate: first };
  }

  const inGroup = list.filter((c) => normalizeCompanyGroupId(c) === gid);
  const first = inGroup[0] ?? null;
  return { selectedGroup: gid, companyToActivate: first };
}

/**
 * Whether a company row should be visible for the shared filter strip (when group strip is shown).
 * @param {"follow"|"all"|"ungrouped"} [groupViewMode="follow"] — same semantics as User List `groupFilterKind`.
 */
export function isCompanyVisibleForSharedFilter(comp, selectedGroup, hideGroupFilter, groupViewMode = "follow") {
  if (hideGroupFilter) return true;
  if (groupViewMode === "all") return true;
  const g = normalizeCompanyGroupId(comp);
  if (groupViewMode === "ungrouped") return !g;
  if (!selectedGroup) return !g;
  return g === selectedGroup;
}

/** Process List / Account List 同款：All 模式下按 group 排序展示全部公司 */
export function sortCompaniesForAllGroupView(companies, groupIds) {
  const list = [...(companies || [])];
  const groupOrder = new Map((groupIds || []).map((gid, idx) => [String(gid).toUpperCase(), idx]));
  return list.sort((a, b) => {
    const ga = normalizeCompanyGroupId(a);
    const gb = normalizeCompanyGroupId(b);
    const ra = groupOrder.has(ga) ? groupOrder.get(ga) : Number.MAX_SAFE_INTEGER;
    const rb = groupOrder.has(gb) ? groupOrder.get(gb) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return String(a.company_id || "").localeCompare(String(b.company_id || ""), undefined, { numeric: true });
  });
}

/** Maintenance 各页公司 pill 可见性（对齐 Process List groupFilterKind 语义） */
export function filterMaintenanceVisibleCompanies(
  companies,
  { groupFilterKind = "follow", selectedGroup = null, groupIds = [], preferredCompanyId = null } = {},
) {
  const list = dedupeOwnerCompaniesByCode(companies, preferredCompanyId);
  const gids = groupIds.length ? groupIds : sortedUniqueGroupIds(list);

  if (groupFilterKind === "all") {
    return sortCompaniesForAllGroupView(list, gids);
  }
  if (groupFilterKind === "ungrouped") {
    return list.filter((c) => !normalizeCompanyGroupId(c));
  }

  const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (gids.length === 0) return list;
  if (!sel) {
    const ung = list.filter((c) => !normalizeCompanyGroupId(c));
    return ung.length ? ung : list;
  }
  const inG = list.filter((c) => normalizeCompanyGroupId(c) === sel);
  return inG.length ? inG : list;
}

/** All 按钮：在 all ↔ ungrouped 间切换（与 Process List 一致） */
export function toggleGroupFilterKind(current) {
  return current === "all" ? "ungrouped" : "all";
}

/**
 * Full legacy group-button behaviour: update filter + session, optionally switch active company.
 * @param {(comp: object) => Promise<void>|void} params.switchCompany receives full company row ({ id, company_id, group_id, … }).
 */
export async function applySharedGroupClickWithCompanySwitch({
  clickedGroupId,
  currentSelectedGroup,
  companies,
  currentCompanyId,
  setSelectedGroup,
  switchCompany,
}) {
  const { selectedGroup: nextGroup, companyToActivate } = applySharedGroupButtonClick({
    clickedGroupId,
    currentSelectedGroup,
    companies,
  });
  persistDashboardGroupFilter(nextGroup);
  setSelectedGroup(nextGroup);
  if (companyToActivate && Number(companyToActivate.id) !== Number(currentCompanyId)) {
    await switchCompany(companyToActivate);
  }
}
