import {
  companiesForCompanyPicker,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
} from "../../../utils/company/sharedCompanyFilter.js";

/** Company pills for Transaction GC filter (synced with filterSnapshot.companyStripRows). */
export function buildTransactionCompanyStripRows(snap, { selectedGroup, companyId, groupsAllMode } = {}) {
  const list = snap?.snapCompaniesAll || snap?.snapCompanies || [];
  const preferredId = companyId ?? null;
  if (groupsAllMode) {
    return excludeGroupLabelsFromCompanyPicker(
      dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(list), preferredId),
    );
  }
  return dedupeOwnerCompaniesByCode(
    companiesForCompanyPicker(list, selectedGroup),
    preferredId,
  );
}
