/**
 * Pure helpers mirroring legacy `js/shared_company_filter.js` + PHP `api/company/company_filter.php` (SSR, unused by SPA).
 * React pages should use these for session key `dashboard_group_filter` and group/company visibility logic.
 *
 * Login scope rules: see `loginScope.js` and `includes/group_company_access.php`.
 */
import { buildApiUrl } from "../core/apiUrl.js";
import { clearCompanySessionFlagsCache, peekCompanySessionFlags } from "./companySessionFlagsCache.js";
import {
  canUseGroupOnlyMode,
  filterCompaniesForLoginScope,
  getAssignedCompanyIds,
  getLoginIdentifier,
  getLoginScope,
  isCompanyLogin,
  isGroupLogin,
  resolveAccessibleGroupIds,
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
/** Set to "1" when company login explicitly cleared the group pill (do not re-derive from company row). */
export const DASHBOARD_GROUP_FILTER_OPT_OUT_KEY = "dashboard_group_filter_opt_out";
/** Set to "1" when user cleared company but kept a group (group-only mode across pages). */
export const DASHBOARD_GROUP_ONLY_KEY = "dashboard_group_only";
/** Last explicitly selected company id (SPA navigation; overrides stale PHP session when set). */
export const DASHBOARD_SELECTED_COMPANY_KEY = "dashboard_selected_company_id";
/** Cross-page currency pill / dropdown selection (scoped by company or group). */
export const DASHBOARD_SELECTED_CURRENCY_KEY = "dashboard_selected_currency_code";
export const DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY = "dashboard_selected_currency_scope";
/** Prevents re-applying login defaults on refresh while the same login session is active. */
export const DASHBOARD_LOGIN_FILTER_APPLIED_KEY = "dashboard_login_filter_applied";
/** Linked group ids (AP+IG) from get_owner_companies_api for company login filter pills. */
export const DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY = "dashboard_accessible_group_ids";
export const DASHBOARD_GROUP_FILTER_EVENT = "eazycount:dashboard-group-filter-changed";
export const DASHBOARD_CURRENCY_FILTER_EVENT = "eazycount:dashboard-currency-filter-changed";

export function clearDashboardFilterSession() {
  clearCompanySessionFlagsCache();
  sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
  sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_COMPANY_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_KEY);
  sessionStorage.removeItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY);
  sessionStorage.removeItem(DASHBOARD_LOGIN_FILTER_APPLIED_KEY);
  sessionStorage.removeItem(DASHBOARD_ACCESSIBLE_GROUP_IDS_KEY);
}

export function buildDashboardCurrencyScopeKey({ companyId, selectedGroup } = {}) {
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) return `company:${cid}`;
  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  return g ? `group:${g}` : null;
}

export function readLastDashboardSelectedCurrency() {
  try {
    const cur = sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_KEY);
    return cur ? String(cur).trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

function normalizeCurrencyCodeList(availableCodes) {
  if (!Array.isArray(availableCodes)) return null;
  const codes = availableCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  return codes.length ? codes : null;
}

function pickCurrencyIfAllowed(code, allowedCodes) {
  const cur = code ? String(code).trim().toUpperCase() : "";
  if (!cur) return null;
  if (allowedCodes?.length && !allowedCodes.includes(cur)) return null;
  return cur;
}

export function persistDashboardSelectedCurrency(scopeKey, code) {
  const key = scopeKey ? String(scopeKey).trim() : "";
  const cur = code ? String(code).trim().toUpperCase() : "";
  if (!cur) return;
  try {
    if (key) sessionStorage.setItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY, key);
    sessionStorage.setItem(DASHBOARD_SELECTED_CURRENCY_KEY, cur);
  } catch {
    /* ignore */
  }
}

/** Last cross-page currency (global; not scoped to a single company). */
export function readDashboardSelectedCurrency(scopeKey, options = {}) {
  const allowed = normalizeCurrencyCodeList(options.availableCodes);
  const last = pickCurrencyIfAllowed(readLastDashboardSelectedCurrency(), allowed);
  if (last) return last;
  const key = scopeKey ? String(scopeKey).trim() : "";
  if (!key) return null;
  try {
    if (sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_SCOPE_KEY) !== key) return null;
    return pickCurrencyIfAllowed(sessionStorage.getItem(DASHBOARD_SELECTED_CURRENCY_KEY), allowed);
  } catch {
    return null;
  }
}

/** Persist + broadcast so every currency-filter page stays in sync. */
export function notifyDashboardCurrencyFilterChanged(currencyCode, scopeKey = null) {
  const code = String(currencyCode || "").trim().toUpperCase();
  if (!code) return;
  const scope =
    scopeKey != null && String(scopeKey).trim()
      ? String(scopeKey).trim()
      : buildDashboardCurrencyScopeKey({});
  persistDashboardSelectedCurrency(scope, code);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_CURRENCY_FILTER_EVENT, {
      detail: { currencyCode: code, scopeKey: scope },
    }),
  );
}

/** Boot / navigation: global last currency wins over stale URL params. */
export function resolveCrossPageCurrencyPreference({
  scopeKey = null,
  availableCodes = [],
  urlCurrency = "",
} = {}) {
  const allowed = normalizeCurrencyCodeList(availableCodes) ?? [];
  const url = String(urlCurrency || "").trim().toUpperCase();
  return (
    pickCurrencyIfAllowed(readLastDashboardSelectedCurrency(), allowed.length ? allowed : null) ||
    readDashboardSelectedCurrency(scopeKey, { availableCodes: allowed }) ||
    pickCurrencyIfAllowed(url, allowed.length ? allowed : null) ||
    allowed[0] ||
    ""
  );
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

/** Cross-page Group / Company filter snapshot from sessionStorage. */
export function readPersistedDashboardGcFilter() {
  const selectedGroupRaw = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  const selectedGroup = selectedGroupRaw ? String(selectedGroupRaw).trim().toUpperCase() : null;
  const savedCompanyId = readDashboardSelectedCompanyId();
  const groupOnly = isDashboardGroupOnlyMode() && savedCompanyId == null;
  return {
    selectedGroup,
    companyId: groupOnly ? null : savedCompanyId,
    groupOnly,
  };
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

/**
 * Standard SPA boot: URL company → persisted subsidiary (group login may have one) → session/default.
 * Group-only applies only when session flag is set and no saved company id exists.
 */
export function resolveGcFilterBootCompanyId({
  urlCompanyId = null,
  sessionCompanyId = null,
  defaultRowId = null,
  me = null,
  companies = null,
} = {}) {
  const persisted = readPersistedDashboardGcFilter();

  const urlNum =
    urlCompanyId != null && urlCompanyId !== "" ? Number(urlCompanyId) : Number.NaN;
  if (Number.isFinite(urlNum) && urlNum > 0) {
    return {
      companyId: urlNum,
      selectedGroup: persisted.selectedGroup,
      groupOnly: false,
    };
  }

  if (persisted.groupOnly) {
    const g = persisted.selectedGroup;
    if (me && g && !canUseGroupOnlyMode(me, g)) {
      persistDashboardGroupOnlyMode(false);
      let cid = readDashboardSelectedCompanyId();
      if ((cid == null || cid <= 0) && Array.isArray(companies) && companies.length) {
        const pick = pickDefaultSubsidiaryForGroup(companies, g, {
          me,
          preferredCompanyId: sessionCompanyId ?? defaultRowId ?? null,
        });
        if (pick?.id) cid = Number(pick.id);
      }
      if (cid != null && cid > 0 && g) {
        persistDashboardFilterState(g, cid, { allowGroupOnly: false });
      }
      return {
        companyId: cid != null && cid > 0 ? cid : null,
        selectedGroup: g,
        groupOnly: false,
      };
    }
    return {
      companyId: null,
      selectedGroup: persisted.selectedGroup,
      groupOnly: true,
    };
  }

  if (persisted.companyId != null) {
    return {
      companyId: persisted.companyId,
      selectedGroup: persisted.selectedGroup,
      groupOnly: false,
    };
  }

  const fallback = resolveBootCompanyId({
    urlCompanyId: null,
    sessionCompanyId,
    defaultRowId,
  });

  const groupOnlyFallback =
    fallback == null &&
    isDashboardGroupOnlyMode() &&
    (!me ||
      !persisted.selectedGroup ||
      canUseGroupOnlyMode(me, persisted.selectedGroup));

  return {
    companyId: fallback,
    selectedGroup: persisted.selectedGroup,
    groupOnly: groupOnlyFallback,
  };
}

/**
 * Company login without group ledger: coerce group-only → subsidiary under the group tab.
 */
export function coerceGroupWrappedCompanyState(me, companies, state = {}) {
  const g = state.selectedGroup ? String(state.selectedGroup).trim().toUpperCase() : null;
  const wantsGroupOnly =
    Boolean(state.groupOnly) ||
    (state.companyId == null && g != null && isDashboardGroupOnlyMode());

  if (wantsGroupOnly && g && me && canUseGroupOnlyMode(me, g)) {
    return { selectedGroup: g, companyId: null, groupOnly: true };
  }

  let cid =
    state.companyId != null && Number(state.companyId) > 0 ? Number(state.companyId) : null;
  if (cid == null) {
    const saved = readDashboardSelectedCompanyId();
    if (saved != null && Number(saved) > 0) cid = Number(saved);
  }
  if (cid == null && g && Array.isArray(companies) && companies.length) {
    const pick = pickDefaultSubsidiaryForGroup(companies, g, {
      me,
      preferredCompanyId: me?.company_id ?? null,
    });
    if (pick?.id) cid = Number(pick.id);
  }

  if (wantsGroupOnly && g && me && !canUseGroupOnlyMode(me, g)) {
    persistDashboardGroupOnlyMode(false);
    if (cid != null) {
      persistDashboardFilterState(g, cid, { allowGroupOnly: false });
    }
  }

  return { selectedGroup: g, companyId: cid, groupOnly: false };
}

function readPersistedGroupFilterCode() {
  const raw = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  return raw ? String(raw).trim().toUpperCase() : null;
}

/** Boot helper: explicit URL company wins; otherwise honour group-only + saved id. */
export function resolveBootCompanyId({
  urlCompanyId = null,
  sessionCompanyId = null,
  defaultRowId = null,
  me = null,
} = {}) {
  const urlNum =
    urlCompanyId != null && urlCompanyId !== "" ? Number(urlCompanyId) : Number.NaN;
  if (Number.isFinite(urlNum) && urlNum > 0) return urlNum;
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) {
    persistDashboardGroupOnlyMode(false);
    return saved;
  }
  if (isDashboardGroupOnlyMode()) {
    const g = readPersistedGroupFilterCode();
    if (me && !canUseGroupOnlyMode(me, g)) {
      persistDashboardGroupOnlyMode(false);
      return resolveInitialCompanyId(sessionCompanyId ?? defaultRowId ?? null, me);
    }
    return null;
  }
  return resolveInitialCompanyId(sessionCompanyId ?? defaultRowId ?? null, me);
}

/** @deprecated Use {@link persistDashboardFilterState} */
export function syncDashboardGroupOnlyFromFilter(selectedGroup, companyId) {
  persistDashboardFilterState(selectedGroup, companyId);
}

/** Company id for page boot: group-only → null; else saved id, then PHP/fallback. */
export function resolveInitialCompanyId(fallbackCompanyId, me = null) {
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) return saved;
  if (isDashboardGroupOnlyMode()) {
    const g = readPersistedGroupFilterCode();
    if (me && !canUseGroupOnlyMode(me, g)) {
      persistDashboardGroupOnlyMode(false);
    } else {
      return null;
    }
  }
  if (fallbackCompanyId == null || fallbackCompanyId === "") return null;
  const id = Number(fallbackCompanyId);
  return Number.isFinite(id) ? id : null;
}

/**
 * Notify layout (sidebar Process visibility) when dashboard Group / Company filter changes.
 * Process is hidden only while a group is selected with no company (see AuthenticatedLayout).
 */
export function notifyDashboardGroupFilterChanged(selectedGroup, companyId, options = {}) {
  const value = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;
  const groupOnly = options.ignoreGroupOnly === true ? false : isDashboardGroupOnlyMode();
  const cid = groupOnly
    ? null
    : companyId != null && companyId !== "" && Number.isFinite(Number(companyId))
      ? Number(companyId)
      : null;
  let companyCode = options.companyCode
    ? String(options.companyCode).trim().toUpperCase()
    : null;
  if (!companyCode && cid != null) {
    const row = findOwnerCompanyById(cid);
    const fromRow = row?.company_id ? String(row.company_id).trim().toUpperCase() : "";
    if (fromRow) companyCode = fromRow;
  }
  const cachedFlags = cid != null ? peekCompanySessionFlags(cid) : null;
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_GROUP_FILTER_EVENT, {
      detail: {
        selectedGroup: value,
        companyId: cid,
        companyCode: companyCode ?? cachedFlags?.company_code ?? null,
        hasGambling: options.hasGambling ?? cachedFlags?.has_gambling,
        hasBank: options.hasBank ?? cachedFlags?.has_bank,
      },
    })
  );
}

/**
 * Sidebar Process: hidden while a group is selected with no company (group-only), except on process routes.
 * Group login with a subsidiary company selected (e.g. C168) keeps Process visible.
 */
export function shouldHideSidebarProcess(pathname) {
  if (
    pathname === "/process-list" ||
    pathname === "/bank-process-list" ||
    pathname === "/games-process-list"
  ) {
    return false;
  }
  const g = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  return Boolean(String(g || "").trim()) && isDashboardGroupOnlyMode();
}

/** In-memory cache so report/maintenance remounts do not re-block on companies API. */
let ownerCompaniesCache = null;
let ownerCompaniesInflight = null;

export function clearOwnerCompaniesCache() {
  ownerCompaniesCache = null;
  ownerCompaniesInflight = null;
}

function hasOwnerCompaniesCache() {
  return Array.isArray(ownerCompaniesCache) && ownerCompaniesCache.length > 0;
}

export function getCachedOwnerCompanies() {
  return hasOwnerCompaniesCache() ? ownerCompaniesCache : null;
}

/** Resolve owner company row from in-memory cache (sidebar optimistic updates). */
export function findOwnerCompanyById(companyId) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rows = getCachedOwnerCompanies();
  if (!rows?.length) return null;
  return rows.find((c) => Number(c.id) === id) ?? null;
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

/** Shared GET owner companies — one HTTP request per session (Layout prefetch + page boot). */
export async function fetchOwnerCompaniesAll(options = {}) {
  const { signal, throwOnError = false } = options;
  return loadOwnerCompaniesCached(async () => {
    const res = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
      credentials: "include",
      signal,
    });
    const json = await res.json();
    persistAccessibleGroupIdsFromApi(json);
    if (throwOnError && (!res.ok || !json.success || !Array.isArray(json.data))) {
      throw new Error(json?.message || json?.error || "Failed to load companies");
    }
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows.map((r) => normalizeOwnerCompanyRow(r)).filter(Boolean);
  });
}

/**
 * Normalize keys from `get_owner_companies_api` (and any proxy) so `company_id` / `group_id`
 * match Account List and Maintenance pages — otherwise Transaction filters stay empty.
 */
export function normalizeOwnerCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  const company_id = row.company_id ?? row.companyId ?? row.code ?? "";
  const group_id = row.group_id ?? row.groupId ?? row.group ?? null;
  const native_group_id =
    row.native_group_id ?? row.nativeGroupId ?? group_id ?? null;
  return {
    ...row,
    company_id,
    group_id,
    native_group_id,
  };
}

/** True when row is a group entity (AP/IG), including GROUPONLY placeholder (empty company_id). */
export function companyRowIsGroupEntityAnyShape(companyRow) {
  if (!companyRow || isVirtualGroupLinkCompanyRow(companyRow)) return false;
  const grp = normalizeCompanyGroupId(companyRow);
  if (!grp) return false;
  const code = String(
    companyRow.company_id ?? companyRow.companyId ?? companyRow.code ?? companyRow.name ?? "",
  )
    .trim()
    .toUpperCase();
  if (code === grp) return true;
  return code === "";
}

/**
 * One pill per company code; prefer the row matching `preferredCompanyId` when duplicates exist.
 * Always merges group-entity rows (e.g. AP placeholder with empty company_id) so Transaction scope can resolve them.
 */
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
  const out = Array.from(byCode.values());
  const seenIds = new Set(out.map((c) => Number(c.id)).filter((id) => id > 0));
  for (const comp of companies || []) {
    if (!companyRowIsGroupEntityAnyShape(comp)) continue;
    const id = Number(comp.id);
    if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) continue;
    out.push(comp);
    seenIds.add(id);
  }
  return out;
}

export function normalizeCompanyGroupId(comp) {
  return String(comp?.group_id ?? "").trim().toUpperCase();
}

/** Database/native group_id (not ownership-coalesced dashboard group_id). */
export function normalizeNativeCompanyGroupId(comp) {
  if (!comp) return "";
  if (isVirtualGroupLinkCompanyRow(comp)) {
    const link = comp.link_source_group
      ? String(comp.link_source_group).trim().toUpperCase()
      : "";
    if (link) return link;
  }
  const native = comp.native_group_id ?? comp.nativeGroupId;
  if (native !== undefined && native !== null) {
    return String(native).trim().toUpperCase();
  }
  return normalizeCompanyGroupId(comp);
}

/** Domain-selected company with no native group (e.g. ABC under BOSS, not AP/IG). */
export function companyRowIsIndependent(companyRow, groupIds = null) {
  if (!companyRow || isVirtualGroupLinkCompanyRow(companyRow)) return false;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds([companyRow]);
  if (companyDisplayCodeIsGroupLabel(companyRow, gids)) return false;
  if (companyRowIsGroupEntityAnyShape(companyRow)) return false;
  return !normalizeNativeCompanyGroupId(companyRow);
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
  if (selectedGroup) {
    sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, selectedGroup);
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
  } else {
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  }
}

/** Company login: deselect group pill while keeping company (never group-only). */
export function clearDashboardGroupFilterKeepCompany(companyId, companyRow = null) {
  sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
  persistDashboardGroupFilter(null);
  persistDashboardGroupOnlyMode(false);
  persistDashboardFilterState(null, companyId, { allowGroupOnly: false });
  const id = Number(companyId);
  const row = companyRow ?? findOwnerCompanyById(id);
  const code = row?.company_id ? String(row.company_id).trim().toUpperCase() : null;
  const flags = Number.isFinite(id) && id > 0 ? peekCompanySessionFlags(id) : null;
  notifyDashboardGroupFilterChanged(null, id, {
    ignoreGroupOnly: true,
    companyCode: code ?? flags?.company_code ?? null,
    hasGambling: flags?.has_gambling,
    hasBank: flags?.has_bank,
  });
}

/**
 * Boot-time resolution (matches transaction/maintenance pages): honour session only when it matches current company's group.
 */
export function resolveInitialSelectedGroupFromSession(companies, currentCompany, loginMe = null) {
  if (sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1") {
    return null;
  }
  const savedRaw = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  const savedGroup = savedRaw ? String(savedRaw).trim().toUpperCase() : null;
  const groups = sortedUniqueGroupIds(companies);
  let selGroup = null;

  if (loginMe?.login_scope === "group" && loginMe?.login_identifier) {
    const visible = resolveAccessibleGroupIds(loginMe, companies);
    if (savedGroup && visible.includes(savedGroup)) {
      return savedGroup;
    }
    const g = String(loginMe.login_identifier).trim().toUpperCase();
    if (visible.includes(g) || groups.includes(g)) {
      sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, g);
      return g;
    }
  }

  if (isDashboardGroupOnlyMode() && savedGroup && groups.includes(savedGroup)) {
    if (!loginMe || canUseGroupOnlyMode(loginMe, savedGroup)) {
      return savedGroup;
    }
    sessionStorage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
  }

  if (
    savedGroup &&
    groups.includes(savedGroup) &&
    (!isCompanyLogin(loginMe) || canUseGroupOnlyMode(loginMe, savedGroup))
  ) {
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
  if (
    !selGroup &&
    currentCompany?.group_id?.trim() &&
    !(
      isCompanyLogin(loginMe) &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
    )
  ) {
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
  const {
    me = null,
    preferredCompanyId = null,
    preferredCompanyCode = null,
    nativeOnly = false,
    groupEntityOnly = false,
  } = options;
  const list = groupEntityOnly
    ? companiesGroupEntityList(companies, groupId)
    : nativeOnly
      ? companiesNativeInGroupList(companies, groupId)
      : companiesInGroupList(companies, groupId);
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

/** Virtual row from group_ownership merge (shown under another group_id). */
export function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

/** Per-company view_group for API access (linked companies under AP/IG, etc.). */
/** Prefer group-entity row for session anchor (AP/IG), not first subsidiary in list order. */
export function pickGroupAnchorCompany(companies, gid) {
  if (!gid) return null;
  const entities = companiesGroupEntityList(companies, gid);
  if (entities.length > 0) return entities[0];
  const list = companiesInGroupList(companies, gid);
  return list[0] ?? null;
}

export function resolveViewGroupForCompany(companyRow, fallbackGroup = null) {
  if (!companyRow) {
    return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
  }
  const link = companyRow.link_source_group
    ? String(companyRow.link_source_group).trim().toUpperCase()
    : "";
  if (link) return link;
  const native = companyRow.group_id
    ? String(companyRow.group_id).trim().toUpperCase()
    : "";
  if (native) return native;
  return fallbackGroup ? String(fallbackGroup).trim().toUpperCase() : null;
}

/** Companies visible under a group tab, including group_ownership virtual rows (for API access / linked earnings). */
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
 * Companies natively in a group (database group_id only).
 * Excludes virtual link rows — not for group-only entity scope (use companiesGroupEntityList).
 */
export function companiesNativeInGroupList(companies, gid) {
  const gids = sortedUniqueGroupIds(companies);
  if (!gid) {
    return filterCompaniesWithDisplayId(companies).filter((c) =>
      companyRowIsIndependent(c, gids),
    );
  }
  const g = String(gid).trim().toUpperCase();
  return filterCompaniesWithDisplayId(companies).filter((c) => {
    if (isVirtualGroupLinkCompanyRow(c)) return false;
    return normalizeNativeCompanyGroupId(c) === g;
  });
}

/**
 * Group entity only (e.g. AP itself) — not subsidiaries such as C168 under group_id AP.
 * Matches company_id === group code, or GROUPONLY placeholder (empty company_id, group_id set).
 */
export function companiesGroupEntityList(companies, gid) {
  if (!gid) return [];
  const g = String(gid).trim().toUpperCase();
  return (companies || []).filter((c) => {
    if (!c || isVirtualGroupLinkCompanyRow(c)) return false;
    const code = String(c.company_id ?? c.companyId ?? c.code ?? "").trim().toUpperCase();
    const grp = normalizeCompanyGroupId(c);
    if (code === g) return true;
    return code === "" && grp === g;
  });
}

export function companyRowIsGroupEntity(companyRow, groupId) {
  const g = String(groupId || "").trim().toUpperCase();
  if (!g || !companyRow) return false;
  if (isVirtualGroupLinkCompanyRow(companyRow)) return false;
  const code = String(
    companyRow.company_id ?? companyRow.companyId ?? companyRow.code ?? companyRow.name ?? "",
  )
    .trim()
    .toUpperCase();
  if (code === g) return true;
  return code === "" && normalizeCompanyGroupId(companyRow) === g;
}

/** Display code equals a group label (AP, IG, …) — belongs on GroupID row only, not Company. */
export function companyDisplayCodeIsGroupLabel(companyRow, groupIds) {
  const code = String(companyRow?.company_id ?? companyRow?.companyId ?? companyRow?.code ?? "")
    .trim()
    .toUpperCase();
  if (!code) return false;
  const ids = groupIds?.length ? groupIds : [];
  const set = new Set(ids.map((g) => String(g).trim().toUpperCase()).filter(Boolean));
  return set.has(code);
}

/**
 * Company filter strip: drop group labels and group-entity rows (incl. virtual link duplicates).
 * @param {string[]|null} [groupIds] — visible group pills; defaults to {@link sortedUniqueGroupIds}
 */
export function excludeGroupLabelsFromCompanyPicker(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return (companies || []).filter((c) => {
    if (companyDisplayCodeIsGroupLabel(c, gids)) return false;
    if (companyRowIsGroupEntityAnyShape(c)) return false;
    return true;
  });
}

/** Companies shown in the Company row when a GroupID is selected (Dashboard-aligned). */
export function companiesForCompanyPicker(companies, selectedGroup, groupIds = null) {
  const list = selectedGroup
    ? companiesNativeInGroupList(companies, selectedGroup)
    : companiesNativeInGroupList(companies, null);
  return excludeGroupLabelsFromCompanyPicker(list, groupIds);
}

/** Subsidiary company row (Process / Account pills) — not group entity or group-id label. */
export function isSubsidiaryCompanyRow(companyRow, groupIds = null) {
  if (!companyRow) return false;
  const id = Number(companyRow.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds([companyRow]);
  if (companyDisplayCodeIsGroupLabel(companyRow, gids)) return false;
  if (companyRowIsGroupEntityAnyShape(companyRow)) return false;
  return true;
}

/** First selectable subsidiary under a group (never AP/IG group-entity row). */
export function pickDefaultSubsidiaryForGroup(companies, groupId, options = {}) {
  const g = String(groupId || "").trim().toUpperCase();
  if (!g) return null;
  const gids = sortedUniqueGroupIds(companies);
  const pick = pickDefaultCompanyForGroup(companies, g, { ...options, nativeOnly: true });
  if (pick && isSubsidiaryCompanyRow(pick, gids)) return pick;
  const list = excludeGroupLabelsFromCompanyPicker(companiesNativeInGroupList(companies, g), gids);
  return list[0] ?? null;
}

/** Only use PHP session company as anchor preference when it belongs to the active group tab. */
export function resolvePreferredCompanyIdForGroupAnchor(companies, groupId, sessionCompanyId) {
  const g = String(groupId || "").trim().toUpperCase();
  if (!g) return null;
  const cid = sessionCompanyId != null ? Number(sessionCompanyId) : Number.NaN;
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const row = (companies || []).find((c) => Number(c.id) === cid);
  if (!row) return null;
  const native = normalizeCompanyGroupId(row);
  const link = row.link_source_group
    ? String(row.link_source_group).trim().toUpperCase()
    : "";
  if (native === g || link === g) return cid;
  return null;
}

/** When switching Group pills, keep the same company code in the target group when possible. */
export function resolveCompanyPickWhenSwitchingGroup(companies, targetGroupId, currentCompanyId) {
  const g = String(targetGroupId || "").trim().toUpperCase();
  const cid = Number(currentCompanyId);
  if (!g) return null;

  if (Number.isFinite(cid) && cid > 0) {
    const row = (companies || []).find((c) => Number(c.id) === cid);
    if (row) {
      const native = normalizeCompanyGroupId(row);
      const link = row.link_source_group
        ? String(row.link_source_group).trim().toUpperCase()
        : "";
      if (native === g || link === g) return row;
      const code = String(row.company_id || "").trim().toUpperCase();
      // Do not carry C168 (or group entity label) into another group's subsidiary pick.
      if (code && code !== "C168" && code !== g) {
        const match = companiesInGroupList(companies, g).find(
          (c) => String(c.company_id || "").trim().toUpperCase() === code,
        );
        if (match) return match;
      }
    }
  }

  if (g === "AP") {
    const c168InGroup = companiesInGroupList(companies, g).find(
      (c) => String(c.company_id || "").trim().toUpperCase() === "C168",
    );
    if (c168InGroup) return c168InGroup;
  }

  return pickDefaultSubsidiaryForGroup(companies, g, { preferredCompanyId: null });
}

/**
 * Boot company for Process / Bank Process: never group-entity id (e.g. -301 / AP row).
 * Prefers saved subsidiary, then first subsidiary in the active group.
 */
export function resolveSubsidiaryBootCompanyId(
  companies,
  { urlCompanyId, sessionCompanyId, selectedGroup = null, loginMe = null } = {},
) {
  const list = companies || [];
  const groupIds = sortedUniqueGroupIds(list);
  const groupKey =
    (selectedGroup ? String(selectedGroup).trim().toUpperCase() : "") ||
    (loginMe?.login_scope === "group" && loginMe?.login_identifier
      ? String(loginMe.login_identifier).trim().toUpperCase()
      : "");

  const acceptId = (rawId) => {
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const row = list.find((c) => Number(c.id) === id);
    return isSubsidiaryCompanyRow(row, groupIds) ? id : null;
  };

  let id = acceptId(
    resolveBootCompanyId({
      urlCompanyId,
      sessionCompanyId: null,
      defaultRowId: null,
    }),
  );
  if (id == null) id = acceptId(sessionCompanyId);
  if (id == null && !isDashboardGroupOnlyMode()) {
    id = acceptId(readDashboardSelectedCompanyId());
  }

  if (id == null && groupKey) {
    const pick = pickDefaultSubsidiaryForGroup(list, groupKey, {
      me: loginMe,
      preferredCompanyId: readDashboardSelectedCompanyId(),
    });
    if (pick?.id != null) id = Number(pick.id);
  }

  if (id == null) {
    const any = excludeGroupLabelsFromCompanyPicker(filterCompaniesWithDisplayId(list), groupIds);
    if (any[0]?.id != null) id = Number(any[0].id);
  }

  return id != null && Number.isFinite(id) && id > 0 ? id : null;
}

/** Independent (ungrouped) companies for the Company picker when GroupID is cleared. */
export function independentCompaniesForPicker(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return excludeGroupLabelsFromCompanyPicker(companiesNativeInGroupList(companies, null), gids);
}

/**
 * Company pills when GroupID is cleared (Transaction Payment behaviour).
 * Ungrouped independents plus, for company login, login / assigned subsidiaries (e.g. C168).
 */
export function companiesForPickerWhenGroupClosed(
  me,
  companies,
  groupIds = null,
  preferredCompanyId = null
) {
  const list = companies ?? [];
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(list);
  const preferred = preferredCompanyId ?? me?.company_id ?? null;
  const merged = [...independentCompaniesForPicker(list, gids)];
  const seen = new Set(
    merged.map((c) => Number(c.id)).filter((id) => Number.isFinite(id) && id > 0)
  );

  const append = (row) => {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    if (!isSubsidiaryCompanyRow(row, gids) || companyDisplayCodeIsGroupLabel(row, gids)) return;
    seen.add(id);
    merged.push(row);
  };

  if (isCompanyLogin(me)) {
    const tryIds = [];
    const prefNum = preferred != null ? Number(preferred) : Number.NaN;
    if (Number.isFinite(prefNum) && prefNum > 0) tryIds.push(prefNum);
    const loginNum = me?.company_id != null ? Number(me.company_id) : Number.NaN;
    if (Number.isFinite(loginNum) && loginNum > 0) tryIds.push(loginNum);
    for (const id of getAssignedCompanyIds(me)) tryIds.push(id);
    for (const id of tryIds) {
      append(list.find((c) => Number(c.id) === id));
    }
    const ident = getLoginIdentifier(me);
    if (ident) {
      append(
        list.find((c) => String(c.company_id || "").trim().toUpperCase() === ident)
      );
    }
  }

  return dedupeOwnerCompaniesByCode(merged, preferred);
}

/**
 * All subsidiaries under visible groups (AP, IG, …) for Company picker when GroupID is "All".
 * Excludes independent companies.
 */
export function allGroupedCompaniesForPicker(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  const seen = new Set();
  const merged = [];
  for (const gid of gids) {
    for (const row of companiesNativeInGroupList(companies, gid)) {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
    }
  }
  return excludeGroupLabelsFromCompanyPicker(merged, gids);
}

function isExcludedFromGroupAggregate(companyRow, groupIds = null, options = {}) {
  if (!companyRow) return true;
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds([companyRow]);
  const { allowC168 = false } = options || {};
  if (!isSubsidiaryCompanyRow(companyRow, gids)) return true;
  const code = String(companyRow.company_id ?? companyRow.companyId ?? "")
    .trim()
    .toUpperCase();
  if (!allowC168 && code === "C168") return true;
  if (companyRowIsIndependent(companyRow, gids)) return true;
  return false;
}

/** Subsidiaries to merge when Company row "All" is active under a group tab (IG/AP). */
export function resolveGroupAllMergeCompanyList(companies, selectedGroup, groupIds = null) {
  const g = String(selectedGroup || "").trim().toUpperCase();
  if (!g) return [];
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return companiesForCompanyPicker(companies, g, gids).filter(
    (c) => !isExcludedFromGroupAggregate(c, gids, { allowC168: false }),
  );
}

/** Subsidiaries to merge when GroupID "All" + Company "All" aggregate every visible group. */
export function resolveGroupsAllMergeCompanyList(companies, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return allGroupedCompaniesForPicker(companies, gids).filter(
    (c) => !isExcludedFromGroupAggregate(c, gids, { allowC168: true }),
  );
}

/**
 * When GroupID "All" is selected: keep current company if it belongs to a group,
 * otherwise activate the first grouped company in picker order.
 */
export function resolveCompanyWhenPickingAllGroups(companies, currentCompanyId, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  const grouped = allGroupedCompaniesForPicker(companies, gids);
  if (!grouped.length) return null;
  const cid = currentCompanyId != null ? Number(currentCompanyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) {
    const inPicker = grouped.find((c) => Number(c.id) === cid);
    if (inPicker) return inPicker;
  }
  return grouped[0] ?? null;
}

/**
 * When closing an active GroupID pill: keep the current company if it is independent,
 * otherwise activate the first independent company in picker order.
 */
export function resolveCompanyWhenClosingGroup(companies, currentCompanyId, groupIds = null) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  const independents = independentCompaniesForPicker(companies, gids);
  if (!independents.length) return null;
  const cid = currentCompanyId != null ? Number(currentCompanyId) : Number.NaN;
  if (Number.isFinite(cid) && cid > 0) {
    const currentRow = (companies || []).find((c) => Number(c.id) === cid);
    if (currentRow && companyRowIsIndependent(currentRow, gids)) {
      const inPicker = independents.find((c) => Number(c.id) === cid);
      if (inPicker) return inPicker;
    }
  }
  return independents[0] ?? null;
}

/**
 * Transaction-aligned: company login closing Group → login / assigned subsidiary (e.g. C168).
 * Group login / owner paths fall back to independent companies.
 */
export function resolveCompanyWhenDeselectingGroup(me, companies, currentCompanyId, groupIds = null) {
  const list = companies ?? [];
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(list);

  if (isCompanyLogin(me)) {
    const tryId = (raw) => {
      const id = Number(raw);
      if (!Number.isFinite(id) || id <= 0) return null;
      return list.find((c) => Number(c.id) === id) ?? null;
    };
    const cur = currentCompanyId != null ? Number(currentCompanyId) : Number.NaN;
    if (Number.isFinite(cur) && cur > 0) {
      const row = tryId(cur);
      if (row) return row;
    }
    const loginRow = tryId(me?.company_id);
    if (loginRow) return loginRow;
    const ident = getLoginIdentifier(me);
    if (ident) {
      const byCode = list.find(
        (c) => String(c.company_id || "").trim().toUpperCase() === ident
      );
      if (byCode) return byCode;
    }
    for (const id of getAssignedCompanyIds(me)) {
      const row = tryId(id);
      if (row) return row;
    }
  }

  return resolveCompanyWhenClosingGroup(list, currentCompanyId, gids);
}

/**
 * Legacy group-button click: toggle off → independent companies + first independent active;
 * select group → first company in that group active.
 * @returns {{ selectedGroup: string|null, companyToActivate: object|null }}
 */
export function applySharedGroupButtonClick({ clickedGroupId, currentSelectedGroup, companies }) {
  const gid = String(clickedGroupId || "").trim().toUpperCase();
  const groupIds = sortedUniqueGroupIds(companies);

  if (currentSelectedGroup === gid) {
    const first = resolveCompanyWhenClosingGroup(companies, null, groupIds);
    return { selectedGroup: null, companyToActivate: first };
  }

  const inGroup = companiesNativeInGroupList(companies, gid);
  const first = excludeGroupLabelsFromCompanyPicker(inGroup, groupIds)[0] ?? inGroup[0] ?? null;
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
  const inG = list.filter(
    (c) => !isVirtualGroupLinkCompanyRow(c) && normalizeCompanyGroupId(c) === sel
  );
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
