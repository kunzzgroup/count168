import { useMemo } from "react";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { supportsDashboardStyleGroupOnly } from "../../../utils/company/loginScope.js";
import { gcInlinePickerCompanies } from "../../../utils/company/sharedCompanyFilter.js";
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
    forceAllowGroupOnly: supportsDashboardStyleGroupOnly(me),
    enableGroupAnchorSession,
  });

  const gcScope = {
    selectedGroup,
    companyId,
    groupsAllMode: gc.groupsAllMode,
    groupAllMode: gc.groupAllMode,
  };
  const visibleCompanies = useMemo(
    () => gcInlinePickerCompanies(gc.companiesForPicker, gcScope),
    [gc.companiesForPicker, selectedGroup, companyId, gc.groupsAllMode, gc.groupAllMode],
  );

  return {
    snapGroupIds: gc.groupIds,
    visibleCompanies,
    handleGroupClick: gc.handlePickGroup,
    handlePickCompany: gc.handlePickCompany,
    handlePickAllGroups: gc.handlePickAllGroups,
    handlePickAllInGroup: gc.handlePickAllInGroup,
    groupsAllMode: gc.groupsAllMode,
    groupAllMode: gc.groupAllMode,
    allowClearCompany: gc.allowClearCompany,
    isListScopeReady: gc.isListScopeReady,
  };
}
