import { buildApiUrl } from "../utils/apiUrl.js";
import { DASHBOARD_BOOTSTRAP_API } from "./dashboardConstants.js";
import { mergeGroupData } from "./dashboardMerge.js";
import {
  companiesInGroup,
  normalizeGroupId,
  pickCompany,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "./dashboardScope.js";
import { assertApiOk, fetchJson } from "./fetchJson.js";

const MERGE_POOL = 5;

function isHistoricalOwnershipMonth(dateTo) {
  const m = String(dateTo || "").trim().match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  const key = `${m[1]}-${m[2]}`;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return key < current;
}

function isGroupEntityRow(row, viewGroup) {
  const vg = normalizeGroupId(viewGroup);
  if (!row || !vg) return false;
  const code = String(row.company_id || "").trim().toUpperCase();
  return code === vg;
}

function applyLinkMultiplier(data, companyRow, viewGroup, dateTo) {
  if (!data || !viewGroup || !companyRow) return data;
  const pct =
    companyRow.link_percentage !== undefined && companyRow.link_percentage !== null
      ? parseFloat(companyRow.link_percentage)
      : NaN;
  const linkMultiplier = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 1;
  const apiHasGroupEquity = parseFloat(data?.group_equity_percentage) > 0;
  if (linkMultiplier !== 1 && !isHistoricalOwnershipMonth(dateTo) && !apiHasGroupEquity) {
    return { ...data, _link_multiplier: linkMultiplier };
  }
  return data;
}

function resolveGroupAllCompanyList(companies, selectedGroup) {
  const g = normalizeGroupId(selectedGroup);
  if (!g) return [];
  return companiesInGroup(companies, g).filter((c) => {
    const code = String(c.company_id || "").trim().toUpperCase();
    return code && code !== "C168" && !isGroupEntityRow(c, g);
  });
}

function resolveGroupsAllCompanyList(companies) {
  const gids = sortedUniqueGroupIds(companies);
  const seen = new Set();
  const out = [];
  for (const g of gids) {
    for (const row of resolveGroupAllCompanyList(companies, g)) {
      const id = Number(row.id);
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const pool = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}

function buildSingleCompanyBootstrapQuery({
  dateFrom,
  dateTo,
  currency,
  currencies,
  companyId,
  viewGroup,
}) {
  const q = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    bootstrap_scope: "full",
    company_id: String(companyId),
  });
  if (currency) q.set("currency", currency);
  if (Array.isArray(currencies) && currencies.length > 1) {
    q.set("currencies", currencies.join(","));
  }
  const vg = normalizeGroupId(viewGroup);
  if (vg) {
    q.set("view_group", vg);
    q.set("group_id", vg);
    q.set("subsidiary_accounts_only", "1");
  }
  return q;
}

async function fetchBootstrapData(query, signal, loadError) {
  const { res, json } = await fetchJson(
    buildApiUrl(`${DASHBOARD_BOOTSTRAP_API}?${query}`),
    { signal },
  );
  assertApiOk(res, json, loadError);
  if (!json?.data) throw new Error(loadError);
  return json.data;
}

/**
 * Load dashboard like desktop:
 * - single company → one bootstrap (with subsidiary scope when in a group)
 * - Company All / Groups All → parallel per-company bootstrap + mergeGroupData
 */
export async function loadMobileDashboardData(scopeState, { signal, loadError } = {}) {
  const {
    dateFrom,
    dateTo,
    currency,
    currencies,
    companyId,
    selectedGroup,
    groupAllMode,
    groupsAllMode,
    companies,
  } = scopeState;

  const needsMerge = Boolean(groupAllMode || groupsAllMode);
  if (!needsMerge) {
    const row =
      (companies || []).find((c) => Number(c.id) === Number(companyId)) ||
      pickCompany(companies, companyId);
    const cid = Number(row?.id || companyId);
    if (!Number.isFinite(cid) || cid <= 0) throw new Error(loadError || "Failed to load dashboard");

    let viewGroup = normalizeGroupId(selectedGroup);
    if (!viewGroup) {
      viewGroup = resolveViewGroupForCompany(row, null);
    }
    // Independent / no group: plain company bootstrap.
    const q = buildSingleCompanyBootstrapQuery({
      dateFrom,
      dateTo,
      currency,
      currencies,
      companyId: cid,
      viewGroup: viewGroup && !isGroupEntityRow(row, viewGroup) ? viewGroup : null,
    });
    const data = await fetchBootstrapData(q, signal, loadError);
    return {
      ...data,
      current: applyLinkMultiplier(data.current, row, viewGroup, dateTo),
      previous: applyLinkMultiplier(data.previous, row, viewGroup, dateTo),
      _mobile_scope: { mode: "single", companyId: cid, viewGroup },
    };
  }

  const list = groupsAllMode
    ? resolveGroupsAllCompanyList(companies)
    : resolveGroupAllCompanyList(companies, selectedGroup);

  if (!list.length) throw new Error(loadError || "Failed to load dashboard");

  const settled = await mapPool(list, MERGE_POOL, async (companyRow) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const viewGroup = groupsAllMode
      ? resolveViewGroupForCompany(companyRow, selectedGroup)
      : normalizeGroupId(selectedGroup) || resolveViewGroupForCompany(companyRow, null);
    const q = buildSingleCompanyBootstrapQuery({
      dateFrom,
      dateTo,
      currency,
      currencies: currency ? [currency] : currencies,
      companyId: companyRow.id,
      viewGroup,
    });
    try {
      const data = await fetchBootstrapData(q, signal, loadError);
      return {
        company: companyRow,
        viewGroup,
        current: applyLinkMultiplier(data.current, companyRow, viewGroup, dateTo),
        previous: applyLinkMultiplier(data.previous, companyRow, viewGroup, dateTo),
        previous_date_range: data.previous_date_range || null,
      };
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      return null;
    }
  });

  const pairs = settled.filter(Boolean);
  if (!pairs.length) throw new Error(loadError || "Failed to load dashboard");

  const current = mergeGroupData(
    pairs.map((p) => p.current).filter(Boolean),
    { startDate: dateFrom, endDate: dateTo },
  );
  const previousList = pairs.map((p) => p.previous).filter(Boolean);
  const previous = previousList.length
    ? mergeGroupData(previousList, { startDate: dateFrom, endDate: dateTo })
    : null;

  return {
    current,
    previous,
    previous_date_range: pairs.find((p) => p.previous_date_range)?.previous_date_range || null,
    earnings: null,
    _mobile_scope: {
      mode: groupsAllMode ? "groupsAll" : "groupAll",
      count: pairs.length,
      group: normalizeGroupId(selectedGroup),
    },
  };
}

export function resolveMobileKpiOwnershipOpts({
  companyId,
  selectedGroup,
  groupAllMode,
  groupsAllMode,
  companies,
}) {
  if (groupsAllMode && groupAllMode) {
    return { groupsAllCompaniesAggregate: true };
  }
  if (groupAllMode && selectedGroup) {
    return { groupAggregateEarnings: true, groupAllCompaniesEarningsSum: true };
  }
  if (groupsAllMode && !groupAllMode) {
    return { groupAggregateEarnings: true, groupAllCompaniesEarningsSum: true };
  }
  const group = normalizeGroupId(selectedGroup);
  if (!groupAllMode && !groupsAllMode && group && companyId != null) {
    const row = (companies || []).find((c) => Number(c.id) === Number(companyId));
    if (row && !isGroupEntityRow(row, group)) {
      return { subsidiaryGroupDrillDown: true };
    }
  }
  return {};
}
