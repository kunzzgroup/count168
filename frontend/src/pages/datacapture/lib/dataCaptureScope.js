import {
  resolveViewGroupForCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { resolveGroupEntityRowFromSnap } from "../../transaction/lib/transactionScope.js";

/**
 * Data Capture scope: group entity (SALARY/BONUS) vs subsidiary company.
 *
 * @returns {{
 *   mode: "group"|"company",
 *   scopeCompanyId: number,
 *   groupId: string|null,
 *   viewGroup: string|null,
 *   uiCompanyId: number|null,
 *   resolveCompanyViaGroupId?: boolean,
 * }|null}
 */
export function resolveDataCaptureScope({
  companies,
  selectedGroup,
  companyId,
  groupOnlyMode = false,
}) {
  const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  const uiCompanyId =
    companyId != null && companyId !== "" && Number(companyId) > 0 ? Number(companyId) : null;

  if (groupOnlyMode && groupKey) {
    const entityRow = resolveGroupEntityRowFromSnap(companies, groupKey);
    const entityId = entityRow?.id != null ? Number(entityRow.id) : 0;
    return {
      mode: "group",
      scopeCompanyId: entityId,
      groupId: groupKey,
      viewGroup: groupKey,
      uiCompanyId: null,
      resolveCompanyViaGroupId: entityId <= 0,
    };
  }

  if (uiCompanyId) {
    const row = (companies || []).find((c) => Number(c.id) === uiCompanyId) || null;
    const viewGroup = resolveViewGroupForCompany(row, groupKey || null);
    return {
      mode: "company",
      scopeCompanyId: uiCompanyId,
      groupId: groupKey || null,
      viewGroup: viewGroup || groupKey || null,
      uiCompanyId,
    };
  }

  return null;
}

export function dataCaptureScopeIsReady(scope) {
  if (!scope) return false;
  if (Number(scope.scopeCompanyId) > 0) return true;
  return Boolean(scope.resolveCompanyViaGroupId && scope.groupId);
}

/** Params for Data Capture / Summary / submitted-process APIs. */
export function dataCaptureScopeApiParams(scope) {
  if (!scope) return {};
  const viewGroup = scope.viewGroup || scope.groupId || undefined;
  const groupId = scope.mode === "group" ? scope.groupId : undefined;
  if (
    scope.resolveCompanyViaGroupId ||
    (scope.mode === "group" && Number(scope.scopeCompanyId) <= 0)
  ) {
    return { companyId: undefined, viewGroup, groupId, reportScope: "group" };
  }
  return {
    companyId: scope.scopeCompanyId,
    viewGroup,
    groupId: scope.mode === "group" ? groupId : scope.groupId || undefined,
    reportScope: scope.mode,
  };
}

export function dataCaptureScopeCacheCompanyKey(scope) {
  if (!scope) return null;
  if (Number(scope.scopeCompanyId) > 0) {
    return scope.mode === "group"
      ? `group:${scope.groupId || scope.scopeCompanyId}`
      : scope.scopeCompanyId;
  }
  if (scope.groupId) return `group:${scope.groupId}`;
  return null;
}

export function dataCaptureScopeCacheKey(scope) {
  if (!scope) return "";
  const companyKey = dataCaptureScopeCacheCompanyKey(scope) ?? "";
  return `${companyKey}:${scope.viewGroup || ""}:${scope.mode}:${scope.uiCompanyId ?? ""}`;
}

/** Reconstruct scope from saved capture session metadata (Summary restore / storage read). */
export function resolveDataCaptureScopeFromSessionMeta(meta, companies = []) {
  if (!meta || typeof meta !== "object") return null;
  const groupKey = meta.captureSelectedGroup
    ? String(meta.captureSelectedGroup).trim().toUpperCase()
    : "";
  const groupOnly = meta.groupOnlyCapture === true;
  if (groupOnly && groupKey) {
    const savedScopeId =
      meta.scopeCompanyId != null && Number(meta.scopeCompanyId) > 0
        ? Number(meta.scopeCompanyId)
        : 0;
    if (savedScopeId > 0) {
      return {
        mode: "group",
        scopeCompanyId: savedScopeId,
        groupId: groupKey,
        viewGroup: groupKey,
        uiCompanyId: null,
      };
    }
    return resolveDataCaptureScope({
      companies,
      selectedGroup: groupKey,
      companyId: null,
      groupOnlyMode: true,
    });
  }
  const cid =
    meta.scopeCompanyId != null && Number(meta.scopeCompanyId) > 0
      ? Number(meta.scopeCompanyId)
      : meta.companyId != null && Number(meta.companyId) > 0
        ? Number(meta.companyId)
        : null;
  if (cid) {
    return resolveDataCaptureScope({
      companies,
      selectedGroup: groupKey || null,
      companyId: cid,
      groupOnlyMode: false,
    });
  }
  return null;
}
