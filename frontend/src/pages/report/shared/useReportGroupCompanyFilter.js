import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { useGcFilterWithAllModes } from "../../../utils/company/useGcFilterWithAllModes.js";

/**
 * Report pages: group-only via company pill deselect; re-clicking active group does not clear company.
 */
export function useReportGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  onPrepareCompanySelect,
  onSelectCompany,
  onClearCompany,
  switchingCompany = false,
  preferredCompanyId = null,
  autoPickCompanyWhenEmpty = false,
  enableGroupAnchorSession = true,
  broadcastFilterToLayout = true,
}) {
  const { me } = useAuthSession();

  return useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onPrepareCompanySelect,
    onSelectCompany,
    onClearCompany,
    switchingCompany,
    preferredCompanyId,
    me,
    autoPickCompanyWhenEmpty,
    enableGroupAnchorSession,
    broadcastFilterToLayout,
    forceAllowGroupOnly: canUseGroupOnlyMode(me),
    clearCompanyOnActiveGroupReselect: false,
  });
}
