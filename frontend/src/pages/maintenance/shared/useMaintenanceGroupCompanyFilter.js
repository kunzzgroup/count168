import { useDashboardStyleGcFilter } from "../../../utils/company/useDashboardStyleGcFilter.js";

/**
 * Maintenance Group / Company filters — Dashboard-aligned (no group ALL/ungrouped, company can be empty).
 */
export function useMaintenanceGroupCompanyFilter({
  companies,
  companyId,
  selectedGroup,
  setSelectedGroup,
  switchCompany,
  onClearCompany,
  switchingCompany = false,
}) {
  const { groupIds, companiesForPicker, handlePickGroup, handlePickCompany } = useDashboardStyleGcFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany: switchCompany,
    onClearCompany,
    switchingCompany,
    preferredCompanyId: companyId,
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
  };
}
