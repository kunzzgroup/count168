import { useCallback, useEffect, useMemo } from "react";
import {
  companiesInGroupList,
  dedupeOwnerCompaniesByCode,
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
      const list = companiesInGroupList(companies, g);
      const first = list[0] ?? null;
      persistDashboardGroupFilter(g);
      persistDashboardGroupOnlyMode(false);
      setSelectedGroup(g);
      if (first && onSelectCompany) await onSelectCompany(first);
    },
    [switchingCompany, selectedGroup, companies, setSelectedGroup, onSelectCompany],
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

  useEffect(() => {
    notifyDashboardGroupFilterChanged(selectedGroup, companyId);
  }, [selectedGroup, companyId]);

  return {
    groupIds,
    companiesForPicker,
    handlePickGroup,
    handlePickCompany,
  };
}
