import { companiesInGroupList } from "../../../utils/company/sharedCompanyFilter.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";

export async function fetchCompanyPermissions(companyCode) {
  if (!companyCode) return [];
  try {
    const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const result = await response.json();
    if (result.success && result.data && Array.isArray(result.data.permissions)) {
      return result.data.permissions;
    }
  } catch (err) {
    console.error("Error fetching company permissions:", err);
  }
  return [];
}

export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes("Bank");
  const hasGames = permissions.includes("Games") || permissions.includes("Gambling");
  return hasBank && !hasGames;
}

export async function fetchCurrencies(companyId, options = {}) {
  const { signal, viewGroup } = options;
  const q = new URLSearchParams();
  if (companyId) q.set("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) q.set("view_group", vg);
  const qs = q.toString();
  const url = buildApiUrl(
    `api/transactions/get_company_currencies_api.php${qs ? `?${qs}` : ""}`,
  );
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load currencies");
  }
  return json.data || [];
}

/** Union of currencies across all companies in a group (dashboard-aligned). */
export async function fetchMergedGroupCurrencies(companies, groupId, options = {}) {
  const groupKey = String(groupId || "").trim().toUpperCase();
  if (!groupKey || !Array.isArray(companies) || !companies.length) return [];

  const rows = companiesInGroupList(companies, groupKey);
  const ids = [
    ...new Set(
      rows.map((c) => Number(c.id)).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (!ids.length) return [];

  const lists = await Promise.all(
    ids.map((cid) => fetchCurrencies(cid, { ...options, viewGroup: groupKey })),
  );

  const byCode = new Map();
  for (const list of lists) {
    for (const row of list) {
      const code = String(row.code || "").trim().toUpperCase();
      if (!code || byCode.has(code)) continue;
      byCode.set(code, { ...row, code });
    }
  }
  return [...byCode.values()].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
}

/** Load currencies for a selected company and/or group (group-only shows pills before company pick). */
export async function fetchReportScopeCurrencies(
  { companyId, selectedGroup, companies },
  options = {},
) {
  const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (companyId) {
    return fetchCurrencies(companyId, { ...options, viewGroup: groupKey || undefined });
  }
  if (groupKey) {
    return fetchMergedGroupCurrencies(companies, groupKey, options);
  }
  return [];
}
