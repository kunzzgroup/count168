import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { useDashboardStyleGcFilter } from "../../../utils/company/useDashboardStyleGcFilter.js";

/**
 * Maintenance Group / Company filters — Dashboard-aligned (no group ALL/ungrouped, company can be empty).
 * `onClearCompany` receives the target group id when invoked from group switch (avoid stale session writes).
 */
export function useMaintenanceGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  switchCompany,
  onClearCompany,
  switchingCompany = false,
  selectFirstCompanyOnGroupChange = false,
}) {
  const { me } = useAuthSession();
  const {
    groupIds,
    companiesForPicker,
    handlePickGroup,
    handlePickCompany,
    allowClearCompany,
  } = useDashboardStyleGcFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany: switchCompany,
    onClearCompany,
    switchingCompany,
    preferredCompanyId: companyId,
    selectFirstCompanyOnGroupChange,
    me,
  });

  return {
    snapGroupIds: groupIds,
    visibleCompanies: companiesForPicker,
    handleGroupClick: handlePickGroup,
    handlePickCompany,
    /** @deprecated Dashboard layout has no group ALL; kept for callers that still destructure it */
    groupFilterKind: "follow",
    /** @deprecated */
    handlePickAllGroups: () => {},
    /** @deprecated */
    followCurrentCompanyGroup: () => {},
    allowClearCompany,
  };
}
