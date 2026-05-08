/**
 * Pure helpers mirroring legacy `js/shared_company_filter.js` + PHP `includes/company_filter.php` behaviour.
 * React pages should use these for session key `dashboard_group_filter` and group/company visibility logic.
 */

export const DASHBOARD_GROUP_FILTER_KEY = "dashboard_group_filter";

export function normalizeCompanyGroupId(comp) {
  return String(comp?.group_id ?? "").trim().toUpperCase();
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
export function resolveInitialSelectedGroupFromSession(companies, currentCompany) {
  const savedGroup = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  const groups = sortedUniqueGroupIds(companies);
  let selGroup = null;
  if (
    savedGroup &&
    groups.includes(savedGroup) &&
    currentCompany?.group_id &&
    normalizeCompanyGroupId(currentCompany) === savedGroup
  ) {
    selGroup = savedGroup;
  } else if (savedGroup && !groups.includes(savedGroup)) {
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
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

/** Whether a company row should be visible for the shared filter strip (when group strip is shown). */
export function isCompanyVisibleForSharedFilter(comp, selectedGroup, hideGroupFilter) {
  if (hideGroupFilter) return true;
  const g = normalizeCompanyGroupId(comp);
  if (!selectedGroup) return !g;
  return g === selectedGroup;
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
