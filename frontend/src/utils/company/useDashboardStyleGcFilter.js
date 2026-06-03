import { useCallback, useLayoutEffect, useMemo } from "react";

import {
  companiesForCompanyPicker,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  isDashboardGroupOnlyMode,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  clearDashboardGroupFilterKeepCompany,
  persistDashboardGroupFilter,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyPickWhenSwitchingGroup,
  sortedUniqueGroupIds,
} from "./sharedCompanyFilter.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
  supportsDashboardStyleGroupOnly,
  resolveVisibleGroupIds,
} from "./loginScope.js";
import { useGroupAnchorSessionSync } from "./useGroupAnchorSessionSync.js";

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
  /** Sync optimistic UI (set company id, apply cache) before background session sync. */
  onPrepareCompanySelect,
  onClearCompany,
  /** Company login: after user deselects the active group pill (company unchanged). */
  onDeselectGroup,
  switchingCompany = false,
  preferredCompanyId = null,
  /** When true, picking a group auto-selects first company in that group (legacy). */
  selectFirstCompanyOnGroupChange = false,
  sessionCompanyId = null,
  /** Data Capture uses custom anchor sync (gambling redirect). */
  enableGroupAnchorSession = true,
  /** When false, do not auto-select first company while group is set and company is cleared. */
  autoPickCompanyWhenEmpty = true,
  /** Maintenance pages: allow group-only scope even for owner login (no auto-pick subsidiary). */
  forceAllowGroupOnly = false,
  /** When false, skip layout broadcast on selectedGroup/companyId changes (page handles manually). */
  broadcastFilterToLayout = true,
  /** Current user from AuthSessionContext — enforces group vs company login rules. */
  me = null,
}) {
  const allowGroupOnly =
    canUseGroupOnlyMode(me) || forceAllowGroupOnly || supportsDashboardStyleGroupOnly(me);
  const allowClearCompany = canClearCompanySelection(me);

  const { resetAnchorSessionRef, markAnchorSynced } = useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId,
    enabled: enableGroupAnchorSession,
  });

  const groupIds = useMemo(
    () => resolveVisibleGroupIds(sortedUniqueGroupIds(companies), me, companies),
    [companies, me]
  );

  const companiesForPicker = useMemo(() => {
    const list = companiesForCompanyPicker(companies, selectedGroup, groupIds);
    return excludeGroupLabelsFromCompanyPicker(
      dedupeOwnerCompaniesByCode(list, preferredCompanyId ?? companyId),
      groupIds
    );
  }, [companies, selectedGroup, groupIds, preferredCompanyId, companyId]);

  const handlePickGroup = useCallback(
    async (gid) => {
      if (switchingCompany) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      if (g === selectedGroup && companyId != null) {
        if (!allowGroupOnly) {
          clearDashboardGroupFilterKeepCompany(companyId);
          setSelectedGroup(null);
          onDeselectGroup?.(companyId);
          return;
        }
        if (!selectFirstCompanyOnGroupChange) {
          persistDashboardFilterState(g, null, { allowGroupOnly: true });
          resetAnchorSessionRef();
          onClearCompany?.(g);
        }
        return;
      }

      persistDashboardGroupFilter(g);
      setSelectedGroup(g);

      if (allowGroupOnly && !selectFirstCompanyOnGroupChange) {
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        resetAnchorSessionRef();
        onClearCompany?.(g);
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, { me, preferredCompanyId: null }) ??
        pickDefaultCompanyForGroup(companies, g, { me, preferredCompanyId: companyId });
      if (pick) {
        persistDashboardFilterState(g, pick.id, { allowGroupOnly: false });
        markAnchorSynced(g, pick.id);
        notifyDashboardGroupFilterChanged(g, pick.id, {
          companyCode: pick.company_id,
          ignoreGroupOnly: true,
        });
        if (onPrepareCompanySelect) onPrepareCompanySelect(pick);
        if (onSelectCompany) void onSelectCompany(pick);
        return;
      }
      if (!canUseGroupOnlyMode(me) && companyId != null) {
        persistDashboardFilterState(g, companyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, companyId, { ignoreGroupOnly: true });
      }
    },
    [
      switchingCompany,
      selectedGroup,
      companies,
      setSelectedGroup,
      onPrepareCompanySelect,
      onSelectCompany,
      onClearCompany,
      onDeselectGroup,
      selectFirstCompanyOnGroupChange,
      resetAnchorSessionRef,
      allowGroupOnly,
      companyId,
      me,
      markAnchorSynced,
    ]
  );

  useLayoutEffect(() => {
    if (allowGroupOnly || !autoPickCompanyWhenEmpty || !selectedGroup || companyId != null) return;
    const pick = pickDefaultCompanyForGroup(companies, selectedGroup, { me, preferredCompanyId: companyId });
    if (!pick) return;
    persistDashboardFilterState(selectedGroup, pick.id, { allowGroupOnly: false });
    markAnchorSynced(selectedGroup, pick.id);
    notifyDashboardGroupFilterChanged(selectedGroup, pick.id, {
      companyCode: pick.company_id,
      ignoreGroupOnly: true,
    });
    if (onSelectCompany) void onSelectCompany(pick);
  }, [
    allowGroupOnly,
    autoPickCompanyWhenEmpty,
    selectedGroup,
    companyId,
    companies,
    me,
    onSelectCompany,
    markAnchorSynced,
  ]);

  const handlePickCompany = useCallback(
    async (c) => {
      if (switchingCompany || !c?.id) return;

      const id = Number(c.id);
      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = String(selectedGroup || "").trim().toUpperCase();
      const isActive =
        companyId != null && Number(companyId) === id && (!gid || gid === sel);
      if (isActive) {
        if (!allowClearCompany) return;
        persistDashboardFilterState(sel || gid, null, { allowGroupOnly: true });
        resetAnchorSessionRef();
        onClearCompany?.(sel || gid);
        return;
      }

      const effectiveGroup = gid || sel;
      if (gid) setSelectedGroup(gid);
      persistDashboardFilterState(effectiveGroup, id, { allowGroupOnly: false });
      markAnchorSynced(effectiveGroup, id);
      notifyDashboardGroupFilterChanged(effectiveGroup, id, {
        companyCode: c.company_id,
        ignoreGroupOnly: true,
      });
      if (onPrepareCompanySelect) onPrepareCompanySelect(c);
      if (onSelectCompany) void onSelectCompany(c);
    },
    [
      switchingCompany,
      companyId,
      selectedGroup,
      setSelectedGroup,
      onPrepareCompanySelect,
      onSelectCompany,
      onClearCompany,
      allowClearCompany,
      resetAnchorSessionRef,
      markAnchorSynced,
    ]
  );

  return {
    groupIds,
    companiesForPicker,
    handlePickGroup,
    handlePickCompany,
    allowClearCompany,
    allowGroupOnly,
    resetAnchorSessionRef,
    markAnchorSynced,
  };
}
