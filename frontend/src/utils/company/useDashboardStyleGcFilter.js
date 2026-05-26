import { useCallback, useLayoutEffect, useMemo } from "react";
import {
  companiesInGroupList,
  dedupeOwnerCompaniesByCode,
  isDashboardGroupOnlyMode,
  notifyDashboardGroupFilterChanged,
  persistDashboardGroupFilter,
  persistDashboardGroupOnlyMode,
  sortedUniqueGroupIds,
} from "./sharedCompanyFilter.js";

/**
 * Dashboard-aligned Group / Company filter: single group selection, company can be cleared,
 * sidebar Process hidden when group-only (via notifyDashboardGroupFilterChanged).
 */
export function useDashboardStyleGcFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  onSelectCompany,
  onClearCompany,
  switchingCompany = false,
  preferredCompanyId = null,
  /** When false, picking a group clears company (maintenance pages). */
  selectFirstCompanyOnGroupChange = true,
}) {
  const groupIds = useMemo(() => sortedUniqueGroupIds(companies), [companies]);

  const companiesForPicker = useMemo(() => {
    const list = companiesInGroupList(companies, selectedGroup);
    return dedupeOwnerCompaniesByCode(list, preferredCompanyId ?? companyId);
  }, [companies, selectedGroup, preferredCompanyId, companyId]);

  const handlePickGroup = useCallback(
    async (gid) => {
      if (switchingCompany) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g || g === selectedGroup) return;
      persistDashboardGroupFilter(g);
      setSelectedGroup(g);
      if (selectFirstCompanyOnGroupChange) {
        const list = companiesInGroupList(companies, g);
        const first = list[0] ?? null;
        persistDashboardGroupOnlyMode(false);
        if (first && onSelectCompany) await onSelectCompany(first);
      } else {
        persistDashboardGroupOnlyMode(true);
        onClearCompany?.();
      }
    },
    [
      switchingCompany,
      selectedGroup,
      companies,
      setSelectedGroup,
      onSelectCompany,
      onClearCompany,
      selectFirstCompanyOnGroupChange,
    ],
  );

  const handlePickCompany = useCallback(
    async (c) => {
      if (switchingCompany || !c?.id) return;
      const id = Number(c.id);
      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
      const isActive =
        companyId != null && Number(companyId) === id && (!gid || gid === sel);
      if (isActive) {
        persistDashboardGroupOnlyMode(true);
        onClearCompany?.();
        return;
      }
      persistDashboardGroupOnlyMode(false);
      if (gid) {
        persistDashboardGroupFilter(gid);
        setSelectedGroup(gid);
      } else {
        persistDashboardGroupFilter(null);
        setSelectedGroup(null);
      }
      if (onSelectCompany) await onSelectCompany(c);
    },
    [switchingCompany, companyId, selectedGroup, setSelectedGroup, onSelectCompany, onClearCompany],
  );

  useLayoutEffect(() => {
    const hasGroup = Boolean(String(selectedGroup || "").trim());
    const noCompany = companyId == null || companyId === "";
    if (hasGroup && noCompany) {
      persistDashboardGroupOnlyMode(true);
    } else if (!noCompany || !hasGroup) {
      persistDashboardGroupOnlyMode(false);
    }
    const cid = isDashboardGroupOnlyMode() ? null : companyId;
    notifyDashboardGroupFilterChanged(selectedGroup, cid);
  }, [selectedGroup, companyId]);

  return {
    groupIds,
    companiesForPicker,
    handlePickGroup,
    handlePickCompany,
  };
}
