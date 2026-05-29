import {
  companiesGroupEntityList,
  companyRowIsGroupEntity,
  resolveViewGroupForCompany,
} from "../../../utils/company/sharedCompanyFilter.js";

/**
 * Group entity row (e.g. AP) — matches transactionScope.resolveGroupEntityRowFromSnap.
 */
export function resolveGroupEntityRowFromSnap(snapCompanies, groupId) {
  const entities = companiesGroupEntityList(snapCompanies, groupId);
  return entities[0] ?? null;
}

/**
 * Group = group entity company's accounts; Company = selected subsidiary's accounts.
 * Table shape is always account-level (buildReportData) — scope differs only by scopeCompanyId.
 */
export function resolveCustomerReportScope({ companies, selectedGroup, companyId }) {
  const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  const uiCompanyId =
    companyId != null && companyId !== "" && Number(companyId) > 0 ? Number(companyId) : null;

  if (uiCompanyId) {
    const row = (companies || []).find((c) => Number(c.id) === uiCompanyId) || null;
    const viewGroup = resolveViewGroupForCompany(row, groupKey || null);
    const entityRow = groupKey ? resolveGroupEntityRowFromSnap(companies, groupKey) : null;
    const entityId = entityRow?.id != null ? Number(entityRow.id) : 0;
    const isGroupEntity =
      Boolean(groupKey) &&
      row != null &&
      (companyRowIsGroupEntity(row, groupKey) || (entityId > 0 && uiCompanyId === entityId));
    return {
      mode: isGroupEntity ? "group" : "company",
      scopeCompanyId: uiCompanyId,
      groupId: groupKey || null,
      viewGroup: viewGroup || groupKey || null,
      uiCompanyId,
    };
  }

  if (groupKey) {
    const entityRow = resolveGroupEntityRowFromSnap(companies, groupKey);
    const entityId = entityRow?.id != null ? Number(entityRow.id) : 0;
    if (entityId > 0) {
      return {
        mode: "group",
        scopeCompanyId: entityId,
        groupId: groupKey,
        viewGroup: groupKey,
        uiCompanyId: null,
      };
    }
    return {
      mode: "group",
      scopeCompanyId: 0,
      groupId: groupKey,
      viewGroup: groupKey,
      uiCompanyId: null,
      resolveCompanyViaGroupId: true,
    };
  }

  return null;
}

export function customerReportScopeIsReady(scope) {
  if (!scope) return false;
  if (Number(scope.scopeCompanyId) > 0) return true;
  return Boolean(scope.resolveCompanyViaGroupId && scope.groupId);
}

/** Params for report / accounts / currencies APIs (aligned with transactionScopeApiParams). */
export function customerReportScopeApiParams(scope) {
  if (!scope) return {};
  const viewGroup = scope.viewGroup || scope.groupId || undefined;
  const groupId = scope.mode === "group" ? scope.groupId : undefined;
  if (
    scope.resolveCompanyViaGroupId ||
    (scope.mode === "group" && Number(scope.scopeCompanyId) <= 0)
  ) {
    return { companyId: undefined, viewGroup, groupId };
  }
  return {
    companyId: scope.scopeCompanyId,
    viewGroup,
    groupId,
  };
}

export function customerReportScopeCacheCompanyKey(scope) {
  if (!scope) return null;
  if (Number(scope.scopeCompanyId) > 0) return scope.scopeCompanyId;
  if (scope.groupId) return `group:${scope.groupId}`;
  return null;
}

export function customerReportScopeCacheKey(scope) {
  if (!scope) return "";
  const companyKey = customerReportScopeCacheCompanyKey(scope) ?? "";
  return `${companyKey}:${scope.viewGroup || ""}:${scope.mode}:${scope.uiCompanyId ?? ""}`;
}
