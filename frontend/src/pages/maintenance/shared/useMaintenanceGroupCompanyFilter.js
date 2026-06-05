import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
} from "../../../utils/company/loginScope.js";
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
    forceAllowGroupOnly: canUseGroupOnlyMode(me),
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
    allowClearCompany: canClearCompanySelection(me, selectedGroup),
    isListScopeReady: gc.isListScopeReady,
  };
}
