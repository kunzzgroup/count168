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
  sortedUniqueGroupIds,
} from "./sharedCompanyFilter.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
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
  /** When false, picking a group clears company (default — shared across all pages). */
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
  const allowGroupOnly = canUseGroupOnlyMode(me) || forceAllowGroupOnly;
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
        if (!canUseGroupOnlyMode(me)) {
          clearDashboardGroupFilterKeepCompany(companyId);
          setSelectedGroup(null);
          onDeselectGroup?.(companyId);
          return;
        }
        if (allowGroupOnly && !selectFirstCompanyOnGroupChange) {
          persistDashboardFilterState(g, null, { allowGroupOnly: true });
          resetAnchorSessionRef();
          onClearCompany?.(g);
          notifyDashboardGroupFilterChanged(g, null);
        }
        return;
      }

      persistDashboardGroupFilter(g);
      setSelectedGroup(g);

      if (allowGroupOnly && !selectFirstCompanyOnGroupChange) {
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        resetAnchorSessionRef();
        onClearCompany?.(g);
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      const pick = pickDefaultCompanyForGroup(companies, g, {
        me,
        preferredCompanyId: companyId,
      });
      if (pick) {
        persistDashboardFilterState(g, pick.id, { allowGroupOnly: false });
        markAnchorSynced(g, pick.id);
        notifyDashboardGroupFilterChanged(g, pick.id, {
          companyCode: pick.company_id,
        });
        if (onPrepareCompanySelect) onPrepareCompanySelect(pick);
        if (onSelectCompany) void onSelectCompany(pick);
        return;
      }
      if (!canUseGroupOnlyMode(me) && companyId != null) {
        persistDashboardFilterState(g, companyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, companyId);
        return;
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
    notifyDashboardGroupFilterChanged(selectedGroup, pick.id);
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
      const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
      const isActive = companyId != null && Number(companyId) === id;

      if (isActive) {
        if (!allowClearCompany) return;
        const g = sel || gid;
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        resetAnchorSessionRef();
        onClearCompany?.(g);
        notifyDashboardGroupFilterChanged(g, null);
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

      persistDashboardFilterState(nextGroup, id, {
        allowGroupOnly: allowGroupOnly && canUseGroupOnlyMode(me),
      });
      markAnchorSynced(nextGroup, id);
      notifyDashboardGroupFilterChanged(nextGroup, id, {
        companyCode: c.company_id,
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
      resetAnchorSessionRef,
      markAnchorSynced,
      allowClearCompany,
      allowGroupOnly,
    ]
  );

  useLayoutEffect(() => {
    if (!broadcastFilterToLayout) return;
    const cid = isDashboardGroupOnlyMode() ? null : companyId;
    notifyDashboardGroupFilterChanged(selectedGroup, cid);
  }, [selectedGroup, companyId, broadcastFilterToLayout]);

  return {
    groupIds,
    companiesForPicker,
    handlePickGroup,
    handlePickCompany,
    allowGroupOnly,
    allowClearCompany,
  };
}
