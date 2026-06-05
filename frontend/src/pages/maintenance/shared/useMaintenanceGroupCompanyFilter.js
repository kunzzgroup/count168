import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { maintenancePageAllowGroupOnlyPill } from "../../../utils/company/loginScope.js";
import { useGcFilterWithAllModes } from "../../../utils/company/useGcFilterWithAllModes.js";

/**
 * Maintenance Group / Company filters — All pills (never sent as group_id / company code).
 */
export function useMaintenanceGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  switchCompany,
  onPrepareCompanySelect,
  onClearCompany,
  switchingCompany = false,
  enableGroupAnchorSession = true,
}) {
  const { me } = useAuthSession();
  const gc = useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany: switchCompany,
    onPrepareCompanySelect,
    onClearCompany,
    switchingCompany,
    preferredCompanyId: companyId,
    me,
    autoPickCompanyWhenEmpty: false,
    forceAllowGroupOnly: maintenancePageAllowGroupOnlyPill(me),
    clearCompanyOnActiveGroupReselect: false,
    enableGroupAnchorSession,
  });

  return {
    snapGroupIds: gc.groupIds,
    visibleCompanies: gc.companiesForPicker,
    handleGroupClick: gc.handlePickGroup,
    handlePickCompany: gc.handlePickCompany,
    handlePickAllGroups: gc.handlePickAllGroups,
    handlePickAllInGroup: gc.handlePickAllInGroup,
    groupsAllMode: gc.groupsAllMode,
    groupAllMode: gc.groupAllMode,
    /** Maintenance pages: always allow re-clicking active company pill → group-only (AP without C168). */
    allowClearCompany: true,
    isListScopeReady: gc.isListScopeReady,
  };
}
