import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import {
  isCompanyLogin,
  maintenancePageAllowGroupOnlyPill,
} from "../../../utils/company/loginScope.js";
import { useGcFilterWithAllModes } from "../../../utils/company/useGcFilterWithAllModes.js";
import { resolveReportCompanyWhenClosingGroup } from "./reportGcBoot.js";

/**
 * Report pages:
 * - Company login: group is a view filter only (no group-only); picking a group auto-selects a company.
 * - Closing group: independent companies only (ABC), never grouped subsidiaries (C168).
 */
export function useReportGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  onPrepareCompanySelect,
  onSelectCompany,
  onClearCompany,
  onDeselectGroup,
  switchingCompany = false,
  preferredCompanyId = null,
  autoPickCompanyWhenEmpty = false,
  enableGroupAnchorSession = true,
  broadcastFilterToLayout = true,
}) {
  const { me } = useAuthSession();
  const companyLoginReport = isCompanyLogin(me);

  return useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onPrepareCompanySelect,
    onSelectCompany,
    onClearCompany,
    onDeselectGroup,
    switchingCompany,
    preferredCompanyId,
    me,
    autoPickCompanyWhenEmpty: companyLoginReport ? true : autoPickCompanyWhenEmpty,
    enableGroupAnchorSession,
    broadcastFilterToLayout,
    forceAllowGroupOnly: !companyLoginReport && maintenancePageAllowGroupOnlyPill(me),
    clearCompanyOnActiveGroupReselect: false,
    allowActiveGroupDeselect: true,
    requireCompanyWithGroup: companyLoginReport,
    allowClearCompany: companyLoginReport ? false : undefined,
    resolveCompanyOnGroupClose: (companyRows, activeCompanyId, groupIds) =>
      resolveReportCompanyWhenClosingGroup(me, companyRows, activeCompanyId, groupIds),
  });
}
