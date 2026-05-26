import { useCallback, useLayoutEffect, useMemo } from "react";
import {
  companiesInGroupList,
  dedupeOwnerCompaniesByCode,
  isDashboardGroupOnlyMode,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
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
  /** When false, picking a group clears company (default — shared across all pages). */
  selectFirstCompanyOnGroupChange = false,
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
        persistDashboardFilterState(g, first?.id ?? null);
        if (first && onSelectCompany) await onSelectCompany(first);
      } else {
        persistDashboardFilterState(g, null);
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
        persistDashboardFilterState(sel || gid, null);
        onClearCompany?.();
        return;
      }
      const nextGroup = gid || null;
      if (nextGroup) {
        persistDashboardGroupFilter(nextGroup);
        setSelectedGroup(nextGroup);
      } else {
        persistDashboardGroupFilter(null);
        setSelectedGroup(null);
      }
      persistDashboardFilterState(nextGroup, id);
      if (onSelectCompany) await onSelectCompany(c);
    },
    [switchingCompany, companyId, selectedGroup, setSelectedGroup, onSelectCompany, onClearCompany],
  );

  useLayoutEffect(() => {
    persistDashboardFilterState(selectedGroup, companyId);
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
