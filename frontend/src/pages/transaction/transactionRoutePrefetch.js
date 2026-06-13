import {
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
} from "../../utils/company/sharedCompanyFilter.js";
import {
  getAccounts,
  getCategories,
  getCompanyCurrencies,
  getUserCurrencyOrder,
  searchTransactions,
} from "./lib/transactionApi.js";
import { formatDmy } from "./lib/transactionFormat.js";
import { buildTransactionBootSnapshot } from "./lib/transactionBootSnapshot.js";
import {
  resolveTransactionScope,
  transactionScopeApiParams,
  transactionScopeCacheCompanyKey,
  resolveTransactionCurrencyOrderCompanyId,
} from "./lib/transactionScope.js";
import { sanitizeSearchApiData } from "./lib/transactionPaymentLogic.js";
import { setTxSearchCache } from "../../utils/transaction/transactionSearchCache.js";

const warmInflight = new Map();

function warmKey(scopeKey) {
  return String(scopeKey || "default");
}

function buildSearchRequestKey({
  scopeCacheCompanyKey,
  dateFrom,
  dateTo,
  showAllCurrencies,
  selectedCurrencies,
}) {
  const cur = !showAllCurrencies && selectedCurrencies?.length
    ? [...selectedCurrencies].map((c) => String(c || "").toUpperCase().trim()).filter(Boolean).sort().join(",")
    : "";
  return JSON.stringify({
    dateFrom,
    dateTo,
    categoryParam: "",
    showInactive: "0",
    showCaptureOnly: "0",
    hideZero: "1",
    companyId: String(scopeCacheCompanyKey || ""),
    showAllCurrencies: !!showAllCurrencies,
    currencies: cur,
  });
}

function readPersistedCurrencyForCompany(companyCacheKey) {
  if (!companyCacheKey) return { showAll: false, currencies: [] };
  try {
    const raw = localStorage.getItem(`transaction_currency_filter_v1_${companyCacheKey}`);
    if (!raw) return { showAll: false, currencies: [] };
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return { showAll: false, currencies: [] };
    return {
      showAll: !!o.showAll,
      currencies: Array.isArray(o.currencies)
        ? o.currencies.map((c) => String(c || "").toUpperCase().trim()).filter(Boolean)
        : [],
    };
  } catch {
    return { showAll: false, currencies: [] };
  }
}

/**
 * Sidebar hover / layout idle — warm metadata + search so /transaction paints with cache.
 * @param {{ me?: object|null }} options
 */
export function warmTransactionRouteCache({ me = null } = {}) {
  if (!me?.user_id) return null;
  const perms = Array.isArray(me.permissions) ? me.permissions : [];
  const hasFull = perms.length === 0;
  if (!hasFull && !perms.includes("payment")) return null;

  const key = warmKey("boot");
  if (warmInflight.has(key)) return warmInflight.get(key);

  const promise = (async () => {
    let rows = getCachedOwnerCompanies();
    if (!rows?.length) {
      try {
        rows = await fetchOwnerCompaniesAll();
      } catch {
        return;
      }
    }
    if (!rows?.length) return;

    const snap = buildTransactionBootSnapshot(me, rows, {
      queryCompany: new URL(window.location.href).searchParams.get("company_id"),
    });
    if (!snap) return;

    const scope = resolveTransactionScope(snap);
    if (!scope) return;
    const scopeKey = `${scope.scopeCompanyId > 0 ? scope.scopeCompanyId : `group:${scope.selectedGroup || ""}`}:${scope.viewGroup || ""}`;
    const scopeApi = transactionScopeApiParams(scope);
    const scopeCacheCompanyKey = transactionScopeCacheCompanyKey(scope);
    const orderCompanyId = resolveTransactionCurrencyOrderCompanyId(
      scope,
      snap.snapCompaniesAll || snap.snapCompanies,
    );
    const currencyPrefs = readPersistedCurrencyForCompany(scopeCacheCompanyKey);
    const todayDmy = formatDmy(new Date());

    const subsidiarySearch =
      scopeApi.subsidiaryAccountsOnly ||
      (scopeApi.companyId != null && Number(scopeApi.companyId) > 0);
    const searchParams = {
      ...scopeApi,
      viewGroup: subsidiarySearch ? undefined : scopeApi.viewGroup,
      groupId: subsidiarySearch ? undefined : scopeApi.groupId,
      groupAggregate: subsidiarySearch ? undefined : scopeApi.groupAggregate,
      subsidiaryAccountsOnly: subsidiarySearch ? true : scopeApi.subsidiaryAccountsOnly,
      dateFrom: todayDmy,
      dateTo: todayDmy,
      showInactive: false,
      showCaptureOnly: false,
      hideZeroBalance: true,
      currencyCodes:
        !currencyPrefs.showAll && currencyPrefs.currencies.length > 0
          ? currencyPrefs.currencies
          : undefined,
    };

    await Promise.all([
      getCategories().catch(() => null),
      orderCompanyId
        ? getUserCurrencyOrder({ companyId: orderCompanyId }).catch(() => null)
        : Promise.resolve(null),
      getAccounts({ ...scopeApi }).catch(() => null),
      getCompanyCurrencies({ ...scopeApi }).catch(() => null),
      searchTransactions(searchParams)
        .then((body) => {
          if (!body?.success || !body?.data) return;
          const requestKey = buildSearchRequestKey({
            scopeCacheCompanyKey,
            dateFrom: todayDmy,
            dateTo: todayDmy,
            showAllCurrencies: currencyPrefs.showAll,
            selectedCurrencies: currencyPrefs.currencies,
          });
          setTxSearchCache(requestKey, sanitizeSearchApiData(body.data));
        })
        .catch(() => null),
    ]);
    void scopeKey;
  })().finally(() => {
    if (warmInflight.get(key) === promise) warmInflight.delete(key);
  });

  warmInflight.set(key, promise);
  return promise;
}
