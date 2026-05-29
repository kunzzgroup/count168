import { useCallback, useMemo, useState } from "react";

import {
  companiesInGroupList,
  filterCompaniesWithDisplayId,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  sortedUniqueGroupIds,
} from "./sharedCompanyFilter.js";
import { getLoginIdentifier, isGroupLogin } from "./loginScope.js";
import { useDashboardStyleGcFilter } from "./useDashboardStyleGcFilter.js";

/**
 * Dashboard-aligned Group / Company filters with explicit All modes.
 * - groupsAllMode: show every group (All is UI-only, never sent as group_id).
 * - groupAllMode: aggregate every company in the current group / groups-all scope.
 */
export function useGcFilterWithAllModes({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  onSelectCompany,
  onClearCompany,
  switchingCompany = false,
  preferredCompanyId = null,
  me = null,
  enableGroupAnchorSession = true,
}) {
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);

  const base = useDashboardStyleGcFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany,
    onClearCompany,
    switchingCompany,
    preferredCompanyId,
    me,
    enableGroupAnchorSession,
    selectFirstCompanyOnGroupChange: false,
  });

  const groupIds = base.groupIds;

  const effectiveGroupForCompanies = useMemo(() => {
    if (groupsAllMode) return null;
    if (selectedGroup) return String(selectedGroup).trim().toUpperCase();
    if (isGroupLogin(me)) return getLoginIdentifier(me);
    return null;
  }, [groupsAllMode, selectedGroup, me]);

  const companiesForPicker = useMemo(() => {
    if (groupsAllMode) return filterCompaniesWithDisplayId(companies);
    return companiesInGroupList(companies, effectiveGroupForCompanies);
  }, [companies, effectiveGroupForCompanies, groupsAllMode]);

  const resolveMergeCompanyList = useCallback(() => {
    if (groupsAllMode) return filterCompaniesWithDisplayId(companies);
    if (effectiveGroupForCompanies) {
      return companiesInGroupList(companies, effectiveGroupForCompanies);
    }
    return filterCompaniesWithDisplayId(companies);
  }, [companies, effectiveGroupForCompanies, groupsAllMode]);

  const mergeCompanyIds = useMemo(() => {
    return resolveMergeCompanyList()
      .map((c) => Number(c.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }, [resolveMergeCompanyList]);

  const handlePickAllGroups = useCallback(() => {
    if (groupsAllMode) return;
    setGroupsAllMode(true);
    setGroupAllMode(false);
    setSelectedGroup(null);
    persistDashboardGroupFilter(null);
    persistDashboardFilterState(null, companyId, { allowGroupOnly: false });
    notifyDashboardGroupFilterChanged(null, companyId);
  }, [groupsAllMode, companyId, setSelectedGroup]);

  const handlePickAllInGroup = useCallback(() => {
    if (groupAllMode && !companyId) return;
    setGroupAllMode(true);
    persistDashboardFilterState(groupsAllMode ? null : selectedGroup, null, {
      allowGroupOnly: false,
    });
    onClearCompany?.(groupsAllMode ? null : selectedGroup);
    notifyDashboardGroupFilterChanged(groupsAllMode ? null : selectedGroup, null);
  }, [groupAllMode, companyId, groupsAllMode, selectedGroup, onClearCompany]);

  const handlePickGroup = useCallback(
    async (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      setGroupsAllMode(false);
      setGroupAllMode(false);
      await base.handlePickGroup(g);
    },
    [base],
  );

  const handlePickCompany = useCallback(
    async (c) => {
      setGroupAllMode(false);
      setGroupsAllMode(false);
      await base.handlePickCompany(c);
    },
    [base],
  );

  const isListScopeReady = useMemo(() => {
    if (companyId != null) return true;
    if (groupAllMode || groupsAllMode) return mergeCompanyIds.length > 0;
    if (selectedGroup) return true;
    if (effectiveGroupForCompanies && isGroupLogin(me)) return true;
    return false;
  }, [
    companyId,
    groupAllMode,
    groupsAllMode,
    mergeCompanyIds.length,
    selectedGroup,
    effectiveGroupForCompanies,
    me,
  ]);

  return {
    ...base,
    groupIds,
    companiesForPicker,
    groupsAllMode,
    groupAllMode,
    setGroupsAllMode,
    setGroupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup,
    handlePickCompany,
    resolveMergeCompanyList,
    mergeCompanyIds,
    isListScopeReady,
  };
}

/** Group ids for per-group aggregate fetch when groups-all without company-all. */
export function groupIdsForGroupsAllAggregate(companies, groupIds) {
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(companies);
  return gids.map((g) => String(g || "").trim().toUpperCase()).filter(Boolean);
}
