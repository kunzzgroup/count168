export function resolveHistoryAccountName({ accountName, accountMeta, accountCode }) {
  const rowName = String(accountName ?? "").trim();
  const apiName = String(accountMeta?.name ?? "").trim();
  const bad = (n) => !n || n.toUpperCase() === "CURRENCY";
  if (!bad(rowName)) return rowName;
  if (!bad(apiName)) return apiName;
  return String(accountMeta?.account_id ?? accountCode ?? "").trim();
}

export function paymentHistoryTitle({ accountCode, accountName, accountMeta }) {
  const code = String(accountMeta?.account_id ?? accountCode ?? "").trim();
  const name = resolveHistoryAccountName({ accountName, accountMeta, accountCode }) || code;
  return `Payment History - ${code} (${name})`;
}

export function buildPaymentHistoryUrl({ row, dateFrom, dateTo, scopeApi, opts = {} }) {
  const params = new URLSearchParams();
  if (scopeApi?.companyId) params.set("company_id", String(scopeApi.companyId));
  if (scopeApi?.viewGroup) params.set("view_group", String(scopeApi.viewGroup));
  if (scopeApi?.groupId) params.set("group_id", String(scopeApi.groupId));
  if (scopeApi?.groupAggregate) params.set("group_aggregate", "1");
  if (scopeApi?.subsidiaryAccountsOnly) params.set("subsidiary_accounts_only", "1");

  const accountDbId = row?.account_db_id ? String(row.account_db_id) : "";
  const accountCode = String(row?.account_id || "").trim();
  if (accountDbId) params.set("account_db_id", accountDbId);
  if (accountCode) params.set("account_code", accountCode);

  const accountName = String(row?.account_name || "").trim();
  if (accountName) params.set("account_name", accountName);

  if (dateFrom) params.set("date_from", String(dateFrom));
  if (dateTo) params.set("date_to", String(dateTo));

  let currency = String(row?.currency || "").toUpperCase().trim();
  const { selectedCurrencies = [], showAllCurrencies = true } = opts;
  if (!currency && !showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0) {
    currency = [...selectedCurrencies]
      .map((c) => String(c || "").toUpperCase().trim())
      .filter(Boolean)
      .join(",");
  }
  if (currency) params.set("currency", currency);

  if (!accountDbId && accountCode) params.set("virtual_company_code", accountCode.toUpperCase());

  params.set("ph", "1");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/transaction?${params.toString()}`;
}

export function isPaymentHistoryView(searchParams) {
  return searchParams?.get("ph") === "1";
}

export function isPaymentHistoryChromelessPath(pathname, searchParams) {
  if (pathname === "/transaction/payment-history") return true;
  if (pathname === "/transaction") return isPaymentHistoryView(searchParams);
  return false;
}

export function parsePaymentHistoryParams(searchParams) {
  const get = (key) => {
    const value = searchParams.get(key);
    return value != null && value !== "" ? value : undefined;
  };
  const companyIdRaw = get("company_id");
  const companyId = companyIdRaw != null ? Number(companyIdRaw) : undefined;
  return {
    companyId: Number.isFinite(companyId) && companyId > 0 ? companyId : undefined,
    viewGroup: get("view_group"),
    groupId: get("group_id"),
    groupAggregate: get("group_aggregate") === "1",
    subsidiaryAccountsOnly: get("subsidiary_accounts_only") === "1",
    accountDbId: get("account_db_id"),
    accountCode: get("account_code"),
    accountName: get("account_name"),
    dateFrom: get("date_from"),
    dateTo: get("date_to"),
    currency: get("currency"),
    virtualCompanyCode: get("virtual_company_code"),
  };
}

export function paymentHistoryParamsReady(params) {
  if (!params?.dateFrom || !params?.dateTo) return false;
  if (!params.accountDbId && !params.virtualCompanyCode) return false;
  if (params.companyId) return true;
  return Boolean(params.viewGroup || params.groupId || params.groupAggregate);
}
