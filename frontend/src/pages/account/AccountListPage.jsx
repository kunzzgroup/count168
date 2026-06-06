import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { peekCompanySessionFlags } from "../../utils/company/companySessionFlagsCache.js";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
import {
  applySidebarForCompanySwitch,
  resolveRowCompanyCode,
} from "../../utils/company/sidebarCompanySwitch.js";
import {
  applyTenantLedgerToParams,
  resolveModalLedgerScope,
  resolvePageLedgerScope,
} from "../../utils/company/tenantLedgerParams.js";
import {
  clearDashboardGroupFilterKeepCompany,
  companiesForCompanyPicker,
  companiesInGroupList,
  dedupeOwnerCompaniesByCode,
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  isDashboardGroupOnlyMode,
  normalizeCompanyGroupId,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  DASHBOARD_GROUP_FILTER_EVENT,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  readPersistedDashboardGcFilter,
  applyLoginScopeToSessionStorageIfNeeded,
  persistDashboardGroupFilter,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyWhenClosingGroup,
  resolveCompanyPickWhenSwitchingGroup,
  readDashboardSelectedCompanyId,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  independentCompaniesForPicker,
  stripCompanyIdFromUrl,
  fetchOwnerCompaniesAll,
  getCachedOwnerCompanies,
} from "../../utils/company/sharedCompanyFilter.js";
import { resolveAccountListRouteCache } from "./accountRoutePrefetch.js";
import {
  canClearCompanySelection,
  canUseGroupOnlyMode,
  getLoginIdentifier,
  isCompanyLogin,
  isGroupLedgerMode,
  isGroupLogin,
  normalizeCompanyCode,
} from "../../utils/company/loginScope.js";
import {
  groupIdsForGroupsAllAggregate,
  useGcFilterWithAllModes,
} from "../../utils/company/useGcFilterWithAllModes.js";
import GcInlineFilterPanel from "../../components/GcInlineFilterPanel.jsx";
import { assetUrl, buildApiUrl } from "../../utils/core/apiUrl.js";
import "../../../public/css/account-list.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";

// Logic & Constants..
import {
  toUpper,
  normalizeAlertAmount,
  roleSortOrder,
  PAGE_SIZE,
  DEFAULT_FORM,
  getOrderedRoles,
  normalizeCompanyRow,
  isVirtualGroupLinkCompanyRow,
  buildAccountsFetchKey,
  buildAccountsUrl,
  buildGroupAccountsUrl,
  fetchMergedAccounts,
  pickDefaultAddCurrencyIds,
} from "./accountLogic.js";

// Components
import AccountModal from "../../components/AccountModal.jsx";
import { processNotificationAboveAccountZIndex, processNotificationZIndex } from "../../components/ProcessModalPortal.jsx";
import {
  AccountConfirmModal,
  CurrencySettingModal,
  LinkAccountModal,
} from "./components/accountModals.jsx";
import {
  getAccountText,
  parseAccountsFromCurrencyDeleteMessage,
  translateAccountApiMessage,
} from "../../translateFile/pages/accountTranslate.js";
import { usePartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";

function resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll) {
  return `${scopeKey}|${String(searchTerm || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
}

function resolveAccountScopeKey({ companyId: cid, selectedGroup: sg, groupOnly = false }) {
  if (cid != null && Number(cid) > 0) return `company:${Number(cid)}`;
  const g = String(sg || "").trim().toUpperCase();
  if (groupOnly && g) return `group:${g}`;
  if (g) return `group:${g}`;
  return "none";
}

/** Active list scope key — must stay in sync with accountsListFetchScopeKey useMemo. */
function resolveAccountsListFetchScopeKey({
  companyId: cid,
  selectedGroup: sg,
  groupsAllMode: gAll = false,
  groupAllMode: cAll = false,
  isListScopeReady: ready = true,
} = {}) {
  if (!ready) return "";
  if (gAll) return cAll ? "groups-all:companies-all" : "groups-all";
  if (cAll) return `group-all:${sg || ""}`;
  if (cid != null) return `company:${cid}`;
  if (sg) return `group:${sg}`;
  return "";
}

function accountRowsFingerprint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "0";
  return rows.map((a) => Number(a.id)).join(",");
}

function readAccountListBootGc() {
  if (typeof sessionStorage === "undefined") {
    return { selectedGroup: null, companyId: null };
  }
  const { selectedGroup, companyId, groupOnly } = readPersistedDashboardGcFilter();
  if (groupOnly || isDashboardGroupOnlyMode()) {
    return { selectedGroup, companyId: null };
  }
  const saved = readDashboardSelectedCompanyId();
  return { selectedGroup, companyId: saved ?? companyId };
}

function readInitialCachedCompanies() {
  const cached = getCachedOwnerCompanies();
  if (!cached?.length) return [];
  return cached.map(normalizeCompanyRow);
}

export default function AccountListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me: sessionMe, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const langRef = useRef(lang);
  langRef.current = lang;
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);

  // -- Status --
  const initialCachedCompanies = useMemo(() => readInitialCachedCompanies(), []);
  const initialBootGc = useMemo(() => readAccountListBootGc(), []);
  const [bootLoading, setBootLoading] = useState(() => initialCachedCompanies.length === 0);

  // -- Data --
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState(() => initialCachedCompanies);
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [companyId, setCompanyId] = useState(() => initialBootGc.companyId);

  // -- Filters --
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("account");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(() => initialBootGc.selectedGroup);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());

  // -- Modals & Forms --
  const [toast, setToast] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [currencySettingOpen, setCurrencySettingOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [isEditMode, setIsEditMode] = useState(false);
  const [initialEditCurrencyIds, setInitialEditCurrencyIds] = useState([]);
  const [linkingAccountId, setLinkingAccountId] = useState(null);
  const [linkAccountsPool, setLinkAccountsPool] = useState([]);
  const [selectedLinkedIds, setSelectedLinkedIds] = useState(new Set());
  const [linkType, setLinkType] = useState("bidirectional");
  const [linkTypeMap, setLinkTypeMap] = useState({});
  const [linkSearchTerm, setLinkSearchTerm] = useState("");

  // -- Child states --
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  /** Add/Edit 弹窗内点 × 隐藏的货币 id（本会话），避免仅取消勾选时界面无变化 */
  const [hiddenCurrencyIds, setHiddenCurrencyIds] = useState([]);
  /** Edit 时账户真实账本 scope（group ledger vs 子公司），与顶部筛选解耦 */
  const [modalLedgerScope, setModalLedgerScope] = useState(null);
  const modalLedgerScopeRef = useRef(null);
  const syncModalLedgerScope = useCallback((scope) => {
    modalLedgerScopeRef.current = scope;
    setModalLedgerScope(scope);
  }, []);
  const [settingCurrencyId, setSettingCurrencyId] = useState(null);
  const [settingLinked, setSettingLinked] = useState(new Set());
  const [settingInitial, setSettingInitial] = useState(new Set());
  const [settingSearch, setSettingSearch] = useState("");
  const [settingRole, setSettingRole] = useState("");

  const toastTimerRef = useRef(null);
  const bootFetchedAccountsKeyRef = useRef(null);
  const bootInitializedRef = useRef(false);
  const accountListCacheRef = useRef(new Map());
  const listFetchAbortRef = useRef(null);
  const listFetchGenRef = useRef(0);
  const companySwitchGenRef = useRef(0);
  const skipCompanyFetchEffectRef = useRef(false);
  const suppressGcSyncRef = useRef(false);
  const lastAccountsFetchKeyRef = useRef("");
  const skipInitialGcSyncRef = useRef(false);
  const onSwitchCompanyRef = useRef(null);
  const gcScopeRef = useRef({});

  const accountModalCurrencies = useMemo(() => {
    const hidden = new Set(hiddenCurrencyIds.map(Number));
    return currencies.filter((c) => !hidden.has(Number(c.id)));
  }, [currencies, hiddenCurrencyIds]);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const durationMs = type === "danger" ? 4000 : 1800;
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const notifyApi = useCallback(
    (apiMessage, fallbackKey, type = "success", params = {}, apiData = null) => {
      notify(translateAccountApiMessage(lang, apiMessage, fallbackKey, params, apiData), type);
    },
    [lang, notify],
  );

  // -- CSS Loading (FOUC Fix) —
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("account-page");

    return () => {
      document.body.classList.remove("account-page", "account-page--show-all", "bg");
      document.body.classList.add("dashboard-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showAll) document.body.classList.add("account-page--show-all");
    else document.body.classList.remove("account-page--show-all");
    return () => document.body.classList.remove("account-page--show-all");
  }, [showAll]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (searchTerm.trim()) url.searchParams.set("search", searchTerm.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, searchTerm, showInactive, showAll]);

  const resolveGroupOnlyFetch = useCallback((gcScope) => {
    const { companyId: cid, selectedGroup: sg, groupsAllMode: gAll, groupAllMode: cAll } = gcScope || {};
    return Boolean(sg && !cid && !cAll && !gAll);
  }, []);

  const fetchAccounts = useCallback(
    async (gcScope, { silent = false, groupOnly = null } = {}) => {
      const scope = gcScope || {};
      const {
        companyId: cid,
        selectedGroup: sg,
        groupsAllMode: gAll,
        groupAllMode: cAll,
        mergeCompanyIds: mergeIds = [],
        groupIds: gids = [],
        isListScopeReady: ready,
      } = scope;
      if (!ready) return;

      const useGroupOnly = groupOnly ?? resolveGroupOnlyFetch(scope);
      const scopeKey = resolveAccountScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupOnly: useGroupOnly,
      });
      const cacheKey = resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll);
      const requestScopeKey = resolveAccountsListFetchScopeKey(scope);

      listFetchAbortRef.current?.abort();
      const ac = new AbortController();
      listFetchAbortRef.current = ac;
      const fetchGen = ++listFetchGenRef.current;

      const isStaleResponse = () =>
        ac.signal.aborted ||
        fetchGen !== listFetchGenRef.current ||
        requestScopeKey !== resolveAccountsListFetchScopeKey(gcScopeRef.current);

      try {
        let nextAccounts = [];
        if (cid) {
          const res = await fetch(buildAccountsUrl(cid, searchTerm, showInactive, showAll).toString(), {
            credentials: "include",
            signal: ac.signal,
          });
          const json = await res.json();
          if (isStaleResponse()) return;
          if (!json.success) {
            if (!silent) notifyApi(json.message, "failedToLoadAccounts", "danger");
            return;
          }
          nextAccounts = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
        } else if (cAll) {
          const merged = await fetchMergedAccounts({
            companyIds: mergeIds,
            searchTerm,
            showInactive,
            showAll,
            signal: ac.signal,
          });
          if (isStaleResponse()) return;
          if (!merged.success) {
            if (!silent) notifyApi(merged.message, "failedToLoadAccounts", "danger");
            return;
          }
          nextAccounts = merged.accounts;
        } else if (gAll) {
          const merged = await fetchMergedAccounts({
            groupIds: groupIdsForGroupsAllAggregate(companies, gids),
            searchTerm,
            showInactive,
            showAll,
            signal: ac.signal,
          });
          if (isStaleResponse()) return;
          if (!merged.success) {
            if (!silent) notifyApi(merged.message, "failedToLoadAccounts", "danger");
            return;
          }
          nextAccounts = merged.accounts;
        } else if (useGroupOnly && sg) {
          const res = await fetch(
            buildGroupAccountsUrl(sg, searchTerm, showInactive, showAll, { groupOnly: true }).toString(),
            { credentials: "include", signal: ac.signal },
          );
          const json = await res.json();
          if (isStaleResponse()) return;
          if (!json.success) {
            if (!silent) notifyApi(json.message, "failedToLoadAccounts", "danger");
            return;
          }
          nextAccounts = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
        } else {
          return;
        }

        if (isStaleResponse()) return;

        accountListCacheRef.current.set(cacheKey, nextAccounts);
        setAccounts((prev) => {
          if (silent && accountRowsFingerprint(prev) === accountRowsFingerprint(nextAccounts)) {
            return prev;
          }
          return nextAccounts;
        });
        if (!silent) {
          setSelectedDeleteIds(new Set());
          setCurrentPage(1);
        }
        syncUrl();
      } catch (e) {
        if (isStaleResponse()) return;
        if (!silent) notifyApi(null, "networkError", "danger");
      }
    },
    [companies, searchTerm, showInactive, showAll, syncUrl, notifyApi, resolveGroupOnlyFetch],
  );

  const applyAccountListCache = useCallback(
    (gcScope, { groupOnly = null } = {}) => {
      const {
        companyId: cid,
        selectedGroup: sg,
        groupsAllMode: gAll,
        groupAllMode: cAll,
      } = gcScope || {};
      const useGroupOnly = groupOnly ?? resolveGroupOnlyFetch(gcScope);
      const scopeKey = resolveAccountScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupOnly: useGroupOnly,
      });
      const cacheKey = resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll);
      const cached = accountListCacheRef.current.get(cacheKey);
      if (!cached) return false;
      setAccounts((prev) =>
        accountRowsFingerprint(prev) === accountRowsFingerprint(cached) ? prev : cached,
      );
      return true;
    },
    [searchTerm, showInactive, showAll, resolveGroupOnlyFetch],
  );

  const applyCacheOrClearAccounts = useCallback(
    (gcScope, options = {}) => {
      const hit = applyAccountListCache(gcScope, options);
      // Static switch UX: keep current rows while background request fetches next scope.
      // Avoid empty/loading flash when cache is cold.
      return hit;
    },
    [applyAccountListCache],
  );

  const invalidateAccountListCacheForScope = useCallback(
    (gcScope, { groupOnly = null } = {}) => {
      const { companyId: cid, selectedGroup: sg, groupsAllMode: gAll, groupAllMode: cAll } = gcScope || {};
      const useGroupOnly = groupOnly ?? resolveGroupOnlyFetch(gcScope);
      const scopeKey = resolveAccountScopeKey({
        companyId: cid,
        selectedGroup: sg,
        groupOnly: useGroupOnly,
      });
      const cacheKey = resolveAccountListCacheKey(scopeKey, searchTerm, showInactive, showAll);
      accountListCacheRef.current.delete(cacheKey);
    },
    [searchTerm, showInactive, showAll, resolveGroupOnlyFetch],
  );

  const loadRoles = useCallback(async ({ companyId: cid = null, groupId = null } = {}) => {
    try {
      const url = new URL(buildApiUrl("api/editdata/editdata_api.php"));
      const gid = (groupId ?? selectedGroup)
        ? String(groupId ?? selectedGroup).trim().toUpperCase()
        : null;
      const numericCid =
        cid != null ? Number(cid) : companyId != null ? Number(companyId) : null;
      const groupOnlyFetch = Boolean(
        gid && (!Number.isFinite(numericCid) || numericCid <= 0),
      );
      if (gid) url.searchParams.set("group_id", gid);
      if (groupOnlyFetch) {
        url.searchParams.set("group_only", "1");
      } else if (Number.isFinite(numericCid) && numericCid > 0) {
        url.searchParams.set("company_id", String(numericCid));
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (json?.success && Array.isArray(json?.data?.roles)) {
        setRoles(json.data.roles);
      }
    } catch {
      /* roles are optional for list; modal refetch on open */
    }
  }, [companyId, selectedGroup, sessionMe]);

  /** Refetch list after add/edit/delete — must pass gc scope (bare fetchAccounts() is a no-op). */
  const refreshAccountList = useCallback(
    (options = {}) => {
      const scope = gcScopeRef.current;
      if (!scope?.isListScopeReady) return;
      const groupOnly = options.groupOnly ?? resolveGroupOnlyFetch(scope);
      invalidateAccountListCacheForScope(scope, { groupOnly });
      void fetchAccounts(scope, { groupOnly, silent: options.silent ?? false });
    },
    [fetchAccounts, invalidateAccountListCacheForScope, resolveGroupOnlyFetch],
  );

  // -- Boot: show Group/Company filters as soon as companies resolve; list loads in background --
  useEffect(() => {
    if (!sessionReady || !sessionMe) return;
    if (bootInitializedRef.current) return;
    bootInitializedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const rows = (await fetchOwnerCompaniesAll()).map(normalizeCompanyRow);
        if (cancelled) return;

        setCompanies(rows);
        applyLoginScopeToSessionStorageIfNeeded(sessionMe, rows);

        const url = new URL(window.location.href);
        const urlCompanyId = url.searchParams.get("company_id");
        const persistedGc = readPersistedDashboardGcFilter();
        const savedCompanyId = readDashboardSelectedCompanyId();
        let initialCompanyId = persistedGc.groupOnly ? null : (persistedGc.companyId ?? savedCompanyId);
        if (
          savedCompanyId != null &&
          !persistedGc.groupOnly &&
          !(canUseGroupOnlyMode(sessionMe) && isDashboardGroupOnlyMode())
        ) {
          persistDashboardGroupOnlyMode(false);
        } else if (
          isDashboardGroupOnlyMode() ||
          (persistedGc.groupOnly && (isGroupLogin(sessionMe) || canUseGroupOnlyMode(sessionMe)))
        ) {
          initialCompanyId = null;
          stripCompanyIdFromUrl();
        } else if (initialCompanyId == null && !isGroupLogin(sessionMe)) {
          initialCompanyId = resolveBootCompanyId({
            urlCompanyId,
            sessionCompanyId: sessionMe.company_id,
            defaultRowId: rows[0]?.id,
          });
        }
        if (
          initialCompanyId == null &&
          (isGroupLogin(sessionMe) ||
            (canUseGroupOnlyMode(sessionMe) && (persistedGc.groupOnly || isDashboardGroupOnlyMode())))
        ) {
          persistDashboardGroupOnlyMode(true);
        }

        const initialSearchTerm = toUpper(url.searchParams.get("search") || "");
        const initialShowInactive = url.searchParams.get("showInactive") === "1";
        const initialShowAll = url.searchParams.get("showAll") === "1";

        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

        const row =
          initialCompanyId != null
            ? rows.find((c) => Number(c.id) === Number(initialCompanyId)) || null
            : null;
        let bootGroup = groupFilterOptOut
          ? null
          : persistedGc.selectedGroup ||
            (isGroupLogin(sessionMe) ? getLoginIdentifier(sessionMe) : null) ||
            resolveInitialSelectedGroupFromSession(rows, row, sessionMe);

        if (bootGroup && initialCompanyId != null) {
          const inGroup = companiesInGroupList(rows, bootGroup).some(
            (c) => Number(c.id) === Number(initialCompanyId),
          );
          if (!inGroup) {
            initialCompanyId = savedCompanyId != null ? savedCompanyId : null;
            if (initialCompanyId == null) stripCompanyIdFromUrl();
          }
        }

        if (groupFilterOptOut) {
          bootGroup = null;
        }

        const groupOnlyBoot =
          initialCompanyId == null &&
          Boolean(bootGroup) &&
          (persistedGc.groupOnly ||
            isDashboardGroupOnlyMode() ||
            canUseGroupOnlyMode(sessionMe, bootGroup));
        const resolvedCompanyId = groupOnlyBoot ? null : initialCompanyId;

        if (bootGroup) {
          persistDashboardGroupFilter(bootGroup);
          if (groupOnlyBoot) {
            persistDashboardGroupOnlyMode(true);
          }
        }

        setCompanyId(resolvedCompanyId);
        setSelectedGroup(bootGroup);
        setSearchTerm(initialSearchTerm);
        setShowInactive(initialShowInactive);
        setShowAll(initialShowAll);
        skipInitialGcSyncRef.current = true;
        setBootLoading(false);
        void loadRoles({ companyId: resolvedCompanyId, groupId: bootGroup });

        const scopeKey = resolvedCompanyId
          ? `company:${Number(resolvedCompanyId)}`
          : groupOnlyBoot && bootGroup
            ? `group:${bootGroup}`
            : null;
        const listCacheKey = scopeKey
          ? resolveAccountListCacheKey(scopeKey, initialSearchTerm, initialShowInactive, initialShowAll)
          : null;
        const fetchKey = scopeKey
          ? buildAccountsFetchKey(scopeKey, initialSearchTerm, initialShowInactive, initialShowAll)
          : null;

        const warmed = scopeKey
          ? await resolveAccountListRouteCache({
              companyId: groupOnlyBoot ? null : resolvedCompanyId,
              groupId: groupOnlyBoot ? bootGroup : null,
              search: initialSearchTerm,
              showInactive: initialShowInactive,
              showAll: initialShowAll,
            })
          : null;

        if (cancelled) return;

        if (Array.isArray(warmed) && warmed.length > 0 && listCacheKey && fetchKey) {
          accountListCacheRef.current.set(listCacheKey, warmed);
          setAccounts(warmed);
          bootFetchedAccountsKeyRef.current = fetchKey;
        } else if (scopeKey && fetchKey) {
          bootFetchedAccountsKeyRef.current = fetchKey;
          const bootScope = {
            companyId: resolvedCompanyId,
            selectedGroup: bootGroup,
            groupsAllMode: false,
            groupAllMode: false,
            mergeCompanyIds: [],
            groupIds: [],
            isListScopeReady: true,
          };
          startTransition(() => {
            void fetchAccounts(bootScope, { silent: true, groupOnly: groupOnlyBoot });
          });
        }

        const syncCompanyId =
          initialCompanyId != null && Number.isFinite(Number(initialCompanyId))
            ? Number(initialCompanyId)
            : null;
        if (syncCompanyId != null && syncCompanyId !== Number(sessionMe.company_id)) {
          void (async () => {
            try {
              const switchUrl = new URL(buildApiUrl("api/session/update_company_session_api.php"));
              switchUrl.searchParams.set("company_id", String(syncCompanyId));
              const res = await fetch(switchUrl.toString(), { credentials: "include" });
              const json = await res.json();
              if (json.success) notifyCompanySessionUpdated();
            } catch {
              /* boot session sync is best-effort */
            }
          })();
        }
      } catch {
        if (!cancelled) navigate("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionReady, sessionMe, navigate, fetchAccounts, loadRoles]);

  useEffect(() => () => listFetchAbortRef.current?.abort(), []);

  const allCompanyButtons = useMemo(
    () => companies.filter(c => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c)),
    [companies]
  );

  const handleClearCompany = useCallback(() => {
    setCompanyId(null);
  }, []);

  const onSwitchCompany = useCallback(
    async (c, { viewGroup = null, fetchList = true } = {}) => {
      const nextCompanyId = Number(c?.id);
      if (!nextCompanyId) return false;

      const vg =
        viewGroup != null && String(viewGroup).trim() !== ""
          ? String(viewGroup).trim().toUpperCase()
          : String(gcScopeRef.current?.selectedGroup ?? selectedGroup ?? "").trim() || null;

      const previousCompanyId =
        Number(companyId) === nextCompanyId
          ? sessionMe?.company_id != null
            ? Number(sessionMe.company_id)
            : null
          : companyId;

      const uiCompanyId = companyId != null ? Number(companyId) : null;
      const forceSessionSync =
        uiCompanyId !== nextCompanyId ||
        normalizeCompanyCode(sessionMe?.company_code) !== resolveRowCompanyCode(c, null);

      const switchGen = ++companySwitchGenRef.current;
      try {
        const json = await syncCompanySessionApi(nextCompanyId, vg, { force: forceSessionSync });
        if (switchGen !== companySwitchGenRef.current) return false;
        if (!json?.success) {
          listFetchAbortRef.current?.abort();
          if (previousCompanyId != null && Number(previousCompanyId) !== nextCompanyId) {
            skipCompanyFetchEffectRef.current = true;
            flushSync(() => {
              setCompanyId(previousCompanyId);
              applyAccountListCache({ ...gcScopeRef.current, companyId: previousCompanyId });
            });
            void fetchAccounts(
              { ...gcScopeRef.current, companyId: previousCompanyId, isListScopeReady: true },
              { silent: true },
            );
          }
          notifyApi(json.message, "failedToSwitchCompany", "danger");
          return false;
        }
        applySidebarForCompanySwitch(vg, c, json.data ?? null);
        if (fetchList) {
          skipCompanyFetchEffectRef.current = true;
          const scope = { ...gcScopeRef.current, companyId: nextCompanyId, isListScopeReady: true };
          const scopeKey = resolveAccountScopeKey({
            companyId: nextCompanyId,
            selectedGroup: scope.selectedGroup,
            groupOnly: false,
          });
          lastAccountsFetchKeyRef.current = buildAccountsFetchKey(
            scopeKey,
            searchTerm,
            showInactive,
            showAll,
          );
          void fetchAccounts(scope, { silent: true });
        }
        return true;
      } catch {
        if (switchGen !== companySwitchGenRef.current) return false;
        listFetchAbortRef.current?.abort();
        if (previousCompanyId != null && Number(previousCompanyId) !== nextCompanyId) {
          skipCompanyFetchEffectRef.current = true;
          flushSync(() => {
            setCompanyId(previousCompanyId);
            applyAccountListCache({ ...gcScopeRef.current, companyId: previousCompanyId });
          });
          void fetchAccounts(
            { ...gcScopeRef.current, companyId: previousCompanyId, isListScopeReady: true },
            { silent: true },
          );
        }
        notify(t("failedToSwitchCompany"), "danger");
        return false;
      }
    },
    [
      applyAccountListCache,
      companyId,
      fetchAccounts,
      applySidebarForCompanySwitch,
      notify,
      notifyApi,
      resolveRowCompanyCode,
      searchTerm,
      showInactive,
      showAll,
      selectedGroup,
      sessionMe,
      t,
    ],
  );

  onSwitchCompanyRef.current = onSwitchCompany;

  const {
    groupIds,
    companiesForPicker,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    isListScopeReady,
    mergeCompanyIds,
    setGroupsAllMode,
    setGroupAllMode,
  } = useGcFilterWithAllModes({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onSelectCompany: (c) =>
      onSwitchCompanyRef.current?.(c, {
        viewGroup: gcScopeRef.current?.selectedGroup ?? selectedGroup,
      }),
    onPrepareCompanySelect: (pick) => {
      const id = Number(pick?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const scope = gcScopeRef.current;
      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        setCompanyId(id);
        applyCacheOrClearAccounts({
          companyId: id,
          selectedGroup: scope?.selectedGroup ?? selectedGroup,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds: scope?.mergeCompanyIds ?? [],
          groupIds: scope?.groupIds ?? [],
          isListScopeReady: true,
        });
      });
    },
    onDeselectGroup: (cid) => {
      const scope = gcScopeRef.current;
      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        applyCacheOrClearAccounts(
          {
            companyId: cid,
            selectedGroup: null,
            groupsAllMode: false,
            groupAllMode: false,
            mergeCompanyIds: scope?.mergeCompanyIds ?? [],
            groupIds: scope?.groupIds ?? [],
            isListScopeReady: true,
          },
          { groupOnly: false },
        );
      });
    },
    onClearCompany: handleClearCompany,
    switchingCompany: false,
    preferredCompanyId: companyId,
    me: sessionMe,
    autoPickCompanyWhenEmpty: false,
    forceAllowGroupOnly: canUseGroupOnlyMode(sessionMe),
    broadcastFilterToLayout: false,
  });

  gcScopeRef.current = {
    companyId,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    mergeCompanyIds,
    groupIds,
    isListScopeReady,
  };

  /** Group-only: still show Company pills so user can narrow scope (same as User List). */
  const inlineCompaniesForPicker = useMemo(() => {
    const groupFilterOptOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

    const independentPicker = () => {
      const list = independentCompaniesForPicker(companies, groupIds);
      if (list.length) {
        return dedupeOwnerCompaniesByCode(list, companyId);
      }
      return excludeGroupLabelsFromCompanyPicker(
        dedupeOwnerCompaniesByCode(filterCompaniesWithDisplayId(companies), companyId),
        groupIds,
      ).filter((c) => !normalizeCompanyGroupId(c));
    };

    if (!selectedGroup || groupFilterOptOut) {
      return independentPicker();
    }

    if (companiesForPicker.length > 0) return companiesForPicker;

    const effectiveGroup = String(selectedGroup).trim().toUpperCase();
    return dedupeOwnerCompaniesByCode(
      companiesForCompanyPicker(companies, effectiveGroup, groupIds),
      companyId,
    );
  }, [companiesForPicker, selectedGroup, companyId, companies, groupIds]);

  const clearCompanyPillSelection = useCallback(
    (c) => {
      const gid = c?.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = String(selectedGroup || "").trim().toUpperCase();
      const g = sel || gid;
      if (!g) return;
      if (!canUseGroupOnlyMode(sessionMe, g)) return;

      const gcScope = {
        companyId: null,
        selectedGroup: g,
        groupsAllMode: false,
        groupAllMode: false,
        mergeCompanyIds,
        groupIds,
        isListScopeReady: true,
      };

      persistDashboardGroupFilter(g);
      persistDashboardGroupOnlyMode(true);
      persistDashboardSelectedCompany(null);
      stripCompanyIdFromUrl();
      notifyDashboardGroupFilterChanged(g, null);

      skipCompanyFetchEffectRef.current = true;
      suppressGcSyncRef.current = true;
      flushSync(() => {
        setCompanyId(null);
        applyCacheOrClearAccounts(gcScope, { groupOnly: true });
      });

      suppressGcSyncRef.current = false;

      const cacheKey = resolveAccountListCacheKey(`group:${g}`, searchTerm, showInactive, showAll);
      lastAccountsFetchKeyRef.current = buildAccountsFetchKey(
        `group:${g}`,
        searchTerm,
        showInactive,
        showAll,
      );
      if (!accountListCacheRef.current.has(cacheKey)) {
        skipCompanyFetchEffectRef.current = true;
        startTransition(() => {
          void fetchAccounts(gcScope, { silent: true, groupOnly: true });
        });
      }
    },
    [
      applyCacheOrClearAccounts,
      fetchAccounts,
      groupIds,
      mergeCompanyIds,
      searchTerm,
      selectedGroup,
      sessionMe,
      showAll,
      showInactive,
    ],
  );

  /** Company login without group assignment: auto-pick subsidiary when group pill has no company. */
  useLayoutEffect(() => {
    if (bootLoading || !sessionMe) return;
    if (isGroupLedgerMode(sessionMe, { companyId, selectedGroup })) return;
    if (canUseGroupOnlyMode(sessionMe, selectedGroup) && isDashboardGroupOnlyMode()) return;
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1"
    ) {
      return;
    }
    if (!isCompanyLogin(sessionMe)) return;
    if (!selectedGroup || companyId != null) return;

    const pick = pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
      me: sessionMe,
      preferredCompanyId: sessionMe?.company_id ?? companyId,
    });
    if (!pick?.id) return;

    const nextId = Number(pick.id);
    const scope = gcScopeRef.current;
    skipCompanyFetchEffectRef.current = true;
    flushSync(() => {
      setCompanyId(nextId);
      applyCacheOrClearAccounts({
        companyId: nextId,
        selectedGroup,
        groupsAllMode: false,
        groupAllMode: false,
        mergeCompanyIds: scope?.mergeCompanyIds ?? [],
        groupIds: scope?.groupIds ?? [],
        isListScopeReady: true,
      });
    });
    persistDashboardGroupOnlyMode(false);
    persistDashboardFilterState(selectedGroup, nextId, { allowGroupOnly: false });
    suppressGcSyncRef.current = true;
    void (async () => {
      try {
        await onSwitchCompanyRef.current?.(pick, { viewGroup: selectedGroup });
      } finally {
        suppressGcSyncRef.current = false;
      }
    })();
  }, [
    bootLoading,
    sessionMe,
    selectedGroup,
    companyId,
    companies,
    applyCacheOrClearAccounts,
  ]);

  /** Company / owner login: toggle off active group pill (auto-pick independent company). */
  const deselectGroupKeepCompany = useCallback(() => {
    skipCompanyFetchEffectRef.current = true;
    suppressGcSyncRef.current = true;
    persistDashboardGroupOnlyMode(false);

    const pickIndependent = resolveCompanyWhenClosingGroup(companies, companyId, groupIds);
    const nextCompanyId = pickIndependent?.id != null ? Number(pickIndependent.id) : null;

    if (nextCompanyId != null && Number.isFinite(nextCompanyId) && nextCompanyId > 0) {
      clearDashboardGroupFilterKeepCompany(nextCompanyId);
      void (async () => {
        try {
          await onSwitchCompanyRef.current?.(pickIndependent, { viewGroup: null });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    } else {
      sessionStorage.setItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY, "1");
      persistDashboardGroupFilter(null);
      persistDashboardFilterState(null, null, { allowGroupOnly: false });
      notifyDashboardGroupFilterChanged(null, null);
      stripCompanyIdFromUrl();
      suppressGcSyncRef.current = false;
    }

    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(null);
      setCompanyId(nextCompanyId);
      if (nextCompanyId != null) {
        applyCacheOrClearAccounts({
          companyId: nextCompanyId,
          selectedGroup: null,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds,
          groupIds,
          isListScopeReady: true,
        });
      } else {
        setAccounts([]);
      }
    });

    if (nextCompanyId != null) {
      const cacheKey = resolveAccountListCacheKey(
        `company:${Number(nextCompanyId)}`,
        searchTerm,
        showInactive,
        showAll,
      );
      if (!accountListCacheRef.current.has(cacheKey)) {
        startTransition(() => {
          void fetchAccounts(
            {
              companyId: nextCompanyId,
              selectedGroup: null,
              groupsAllMode: false,
              groupAllMode: false,
              mergeCompanyIds,
              groupIds,
              isListScopeReady: true,
            },
            { silent: true },
          );
        });
      }
    }
  }, [
    applyCacheOrClearAccounts,
    companies,
    companyId,
    fetchAccounts,
    groupIds,
    mergeCompanyIds,
    searchTerm,
    showAll,
    showInactive,
    setCompanyId,
    setGroupAllMode,
    setGroupsAllMode,
  ]);

  const onPickGroupPill = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      const current = String(selectedGroup || "").trim().toUpperCase();
      const allowGroupOnly = isGroupLogin(sessionMe) || canUseGroupOnlyMode(sessionMe, g);

      if (!g) return;

      if (g === current) {
        deselectGroupKeepCompany();
        return;
      }

      if (allowGroupOnly) {
        sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
        const gcScope = {
          companyId: null,
          selectedGroup: g,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds,
          groupIds,
          isListScopeReady: true,
        };
        skipCompanyFetchEffectRef.current = true;
        suppressGcSyncRef.current = true;
        flushSync(() => {
          setGroupsAllMode(false);
          setGroupAllMode(false);
          setSelectedGroup(g);
          setCompanyId(null);
          applyCacheOrClearAccounts(gcScope, { groupOnly: true });
        });
        persistDashboardGroupFilter(g);
        persistDashboardGroupOnlyMode(true);
        persistDashboardFilterState(g, null, { allowGroupOnly: true });
        persistDashboardSelectedCompany(null);
        stripCompanyIdFromUrl();
        notifyDashboardGroupFilterChanged(g, null);
        suppressGcSyncRef.current = false;
        const cacheKey = resolveAccountListCacheKey(`group:${g}`, searchTerm, showInactive, showAll);
        lastAccountsFetchKeyRef.current = buildAccountsFetchKey(
          `group:${g}`,
          searchTerm,
          showInactive,
          showAll,
        );
        if (!accountListCacheRef.current.has(cacheKey)) {
          skipCompanyFetchEffectRef.current = true;
          startTransition(() => {
            void fetchAccounts(gcScope, { silent: true, groupOnly: true });
          });
        }
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, {
          me: sessionMe,
          preferredCompanyId: null,
        });
      if (!pick?.id) return;

      const nextCompanyId = Number(pick.id);
      skipCompanyFetchEffectRef.current = true;
      suppressGcSyncRef.current = true;
      sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY);
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(g);
        setCompanyId(nextCompanyId);
        applyCacheOrClearAccounts({
          companyId: nextCompanyId,
          selectedGroup: g,
          groupsAllMode: false,
          groupAllMode: false,
          mergeCompanyIds,
          groupIds,
          isListScopeReady: true,
        });
      });
      persistDashboardGroupFilter(g);
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(g, nextCompanyId, { allowGroupOnly: false });
      void (async () => {
        try {
          await onSwitchCompanyRef.current?.(pick, { viewGroup: g });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    },
    [
      applyCacheOrClearAccounts,
      companies,
      companyId,
      deselectGroupKeepCompany,
      fetchAccounts,
      groupIds,
      mergeCompanyIds,
      searchTerm,
      sessionMe,
      selectedGroup,
      showAll,
      showInactive,
      setGroupAllMode,
      setGroupsAllMode,
    ],
  );

  const onPickCompanyPill = useCallback(
    (c, pillActive = false) => {
      const nextCompanyId = Number(c?.id);
      if (!nextCompanyId) return;

      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const sel = String(selectedGroup || "").trim().toUpperCase();
      const isActive =
        pillActive || (companyId != null && Number(companyId) === nextCompanyId);
      if (isActive) {
        clearCompanyPillSelection(c);
        return;
      }

      const nextGroup = gid || null;
      const effectiveGroup = nextGroup || sel;
      const groupChanged = Boolean(nextGroup && nextGroup !== sel);
      skipCompanyFetchEffectRef.current = true;
      suppressGcSyncRef.current = true;
      flushSync(() => {
        if (groupChanged) setSelectedGroup(nextGroup);
        setCompanyId(nextCompanyId);
        applyCacheOrClearAccounts({
          companyId: nextCompanyId,
          selectedGroup: effectiveGroup,
          isListScopeReady: true,
        });
      });

      if (nextGroup) persistDashboardGroupFilter(nextGroup);
      else if (effectiveGroup) persistDashboardGroupFilter(effectiveGroup);
      persistDashboardGroupOnlyMode(false);
      persistDashboardFilterState(effectiveGroup, nextCompanyId, { allowGroupOnly: false });
      void (async () => {
        try {
          await onSwitchCompanyRef.current?.(c, { viewGroup: effectiveGroup });
        } finally {
          suppressGcSyncRef.current = false;
        }
      })();
    },
    [applyCacheOrClearAccounts, clearCompanyPillSelection, companyId, selectedGroup],
  );

  const syncGcFilterFromSession = useCallback(() => {
    if (bootLoading || !companies.length) return;
    if (suppressGcSyncRef.current) return;

    const { selectedGroup: nextGroup, companyId: nextCompanyId } = readPersistedDashboardGcFilter();
    const optOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";

    if (!nextGroup && optOut) {
      const targetCompanyId =
        nextCompanyId != null && Number.isFinite(Number(nextCompanyId)) && Number(nextCompanyId) > 0
          ? Number(nextCompanyId)
          : companyId;
      const groupCleared = !selectedGroup;
      const companySynced =
        targetCompanyId == null
          ? companyId == null
          : companyId != null && Number(companyId) === Number(targetCompanyId);
      if (groupCleared && companySynced) return;

      skipCompanyFetchEffectRef.current = true;
      flushSync(() => {
        setGroupsAllMode(false);
        setGroupAllMode(false);
        setSelectedGroup(null);
        if (targetCompanyId != null) {
          setCompanyId(targetCompanyId);
          applyCacheOrClearAccounts({
            companyId: targetCompanyId,
            selectedGroup: null,
            isListScopeReady: true,
          });
        }
      });
      return;
    }

    if (!nextGroup) return;

    const currentGroup = String(selectedGroup || "").trim().toUpperCase();
    const targetGroup = String(nextGroup).trim().toUpperCase();
    const groupSame = currentGroup === targetGroup;
    const companySame =
      (nextCompanyId == null && companyId == null) ||
      (nextCompanyId != null && companyId != null && Number(companyId) === Number(nextCompanyId));
    if (groupSame && companySame) return;

    skipCompanyFetchEffectRef.current = true;
    flushSync(() => {
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(targetGroup);
      setCompanyId(nextCompanyId);
      if (nextCompanyId != null) {
        applyCacheOrClearAccounts({
          companyId: nextCompanyId,
          selectedGroup: targetGroup,
          isListScopeReady: true,
        });
      } else {
        applyCacheOrClearAccounts(
          { companyId: null, selectedGroup: targetGroup, isListScopeReady: true },
          { groupOnly: true },
        );
      }
    });

    if (nextCompanyId != null) {
      persistDashboardGroupOnlyMode(false);
      const pick = companies.find((c) => Number(c.id) === Number(nextCompanyId));
      if (pick) {
        skipCompanyFetchEffectRef.current = true;
        suppressGcSyncRef.current = true;
        void (async () => {
          try {
            await onSwitchCompanyRef.current?.(pick, { viewGroup: targetGroup });
          } finally {
            suppressGcSyncRef.current = false;
          }
        })();
      } else {
        skipCompanyFetchEffectRef.current = true;
        void fetchAccounts(
          { companyId: nextCompanyId, selectedGroup: targetGroup, isListScopeReady: true },
          { silent: true },
        );
      }
    } else {
      persistDashboardGroupOnlyMode(true);
      skipCompanyFetchEffectRef.current = true;
      const groupScope = { companyId: null, selectedGroup: targetGroup, isListScopeReady: true };
      lastAccountsFetchKeyRef.current = buildAccountsFetchKey(
        `group:${targetGroup}`,
        searchTerm,
        showInactive,
        showAll,
      );
      void fetchAccounts(groupScope, { silent: true, groupOnly: true });
    }
  }, [
    applyCacheOrClearAccounts,
    bootLoading,
    companies,
    companyId,
    fetchAccounts,
    searchTerm,
    selectedGroup,
    setGroupAllMode,
    setGroupsAllMode,
    showAll,
    showInactive,
  ]);

  useEffect(() => {
    if (bootLoading) return;
    const onFilterChanged = () => {
      syncGcFilterFromSession();
    };
    window.addEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
    return () => window.removeEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChanged);
  }, [bootLoading, syncGcFilterFromSession]);

  useEffect(() => {
    if (bootLoading) return;
    if (location.pathname !== "/account-list" && location.pathname !== "/add-account") return;
    if (skipInitialGcSyncRef.current) {
      skipInitialGcSyncRef.current = false;
      return;
    }
    syncGcFilterFromSession();
  }, [bootLoading, location.pathname, syncGcFilterFromSession]);

  useEffect(() => {
    if (bootLoading || !selectedGroup) return;
    setGroupsAllMode(false);
    setGroupAllMode(false);
  }, [bootLoading, selectedGroup, setGroupsAllMode, setGroupAllMode]);

  const accountsListFetchScopeKey = useMemo(
    () =>
      bootLoading
        ? ""
        : resolveAccountsListFetchScopeKey({
            companyId,
            selectedGroup,
            groupsAllMode,
            groupAllMode,
            isListScopeReady,
          }),
    [bootLoading, isListScopeReady, groupsAllMode, groupAllMode, companyId, selectedGroup],
  );

  useEffect(() => {
    if (!accountsListFetchScopeKey) return;
    const fetchKey = buildAccountsFetchKey(
      accountsListFetchScopeKey,
      searchTerm,
      showInactive,
      showAll,
    );
    if (skipCompanyFetchEffectRef.current) {
      skipCompanyFetchEffectRef.current = false;
      lastAccountsFetchKeyRef.current = fetchKey;
      return;
    }
    if (bootFetchedAccountsKeyRef.current === fetchKey) {
      bootFetchedAccountsKeyRef.current = null;
      lastAccountsFetchKeyRef.current = fetchKey;
      return;
    }
    if (lastAccountsFetchKeyRef.current === fetchKey) return;
    lastAccountsFetchKeyRef.current = fetchKey;
    void fetchAccounts(gcScopeRef.current);
  }, [accountsListFetchScopeKey, searchTerm, showInactive, showAll, fetchAccounts]);

  // -- Computed --
  const sortedAccounts = useMemo(() => {
    const arr = [...accounts];
    arr.sort((a, b) => {
      let base = 0;
      if (sortColumn === "role") {
        const ao = roleSortOrder(a.role, roles);
        const bo = roleSortOrder(b.role, roles);
        base = ao - bo;
      } else if (sortColumn === "alert") {
        base = Number(a.payment_alert || 0) - Number(b.payment_alert || 0);
      } else {
        const getValue = (account) => {
          if (sortColumn === "name") return account.name;
          if (sortColumn === "status") return account.status;
          if (sortColumn === "lastLogin") return account.last_login;
          if (sortColumn === "remark") return account.remark;
          return account.account_id;
        };
        base = String(getValue(a) || "").localeCompare(String(getValue(b) || ""), undefined, { numeric: true, sensitivity: "base" });
      }

      if (base === 0 && sortColumn !== "account") {
        base = String(a.account_id || "").localeCompare(String(b.account_id || ""), undefined, { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? base : -base;
    });
    return arr;
  }, [accounts, sortColumn, sortDirection, roles]);

  const orderedRoles = useMemo(() => {
    const merged = [...(roles || [])];
    if (form.role && String(form.role).trim()) {
      merged.push(String(form.role).trim());
    }
    return getOrderedRoles(merged);
  }, [roles, form.role]);

  const filteredForMode = useMemo(() => {
    return sortedAccounts;
  }, [sortedAccounts]);

  const accountMutationsBlocked = usePartnershipAuditReadOnlyLocked(sessionMe);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredForMode.length / PAGE_SIZE)), [filteredForMode]);
  const pageRows = useMemo(() => {
    if (showAll) return filteredForMode;
    const p = Math.min(currentPage, totalPages);
    return filteredForMode.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [filteredForMode, showAll, currentPage, totalPages]);

  /** React scope (instant on pill click) — do not wait for sessionStorage group-only flag. */
  const isGroupOnlyScope = useMemo(
    () => Boolean(selectedGroup && !companyId && !groupAllMode && !groupsAllMode),
    [selectedGroup, companyId, groupAllMode, groupsAllMode],
  );
  /** No subsidiary company pill selected → group ledger APIs only (never legacy group-entity company row). */
  const groupOnlyAccountMode = isGroupOnlyScope;
  const groupPickerCompanies = useMemo(() => {
    if (!groupOnlyAccountMode) return [];
    return groupIds
      .map((gid) => {
        const groupCode = String(gid || "").trim().toUpperCase();
        if (!groupCode) return null;
        // Group picker options are group identities, not company rows.
        return { id: groupCode, company_id: groupCode, group_id: groupCode };
      })
      .filter(Boolean);
  }, [groupOnlyAccountMode, groupIds]);
  const modalPickerCompanies = useMemo(
    () => (groupOnlyAccountMode ? groupPickerCompanies : allCompanyButtons),
    [groupOnlyAccountMode, groupPickerCompanies, allCompanyButtons]
  );
  const scopeCompanyId = useMemo(() => {
    if (companyId) return Number(companyId);
    if (!groupOnlyAccountMode || !selectedGroup) return null;
    const groupCode = String(selectedGroup).trim().toUpperCase();
    const entity = allCompanyButtons.find(
      (c) => String(c.company_id || "").trim().toUpperCase() === groupCode
    );
    return entity?.id ? Number(entity.id) : null;
  }, [companyId, groupOnlyAccountMode, selectedGroup, allCompanyButtons]);

  useEffect(() => {
    if (!showInactive && !showAll) setSelectedDeleteIds(new Set());
  }, [showInactive, showAll]);

  const togglePaymentAlert = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData(); fd.append("id", id);
      appendAccountScopeParams(fd);
      const res = await fetch(buildApiUrl("api/accounts/toggle_payment_alert_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const next = json.data?.newPaymentAlert ?? json.newPaymentAlert;
        setAccounts(prev => prev.map(a => Number(a.id) === Number(id) ? { ...a, payment_alert: next } : a));
      }
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const toggleAccountStatus = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData(); fd.append("id", id);
      appendAccountScopeParams(fd);
      const res = await fetch(buildApiUrl("api/accounts/toggle_account_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const next = json.newStatus || json.data?.newStatus;
        setAccounts(prev => {
          const updated = prev.map(a => Number(a.id) === Number(id) ? { ...a, status: next } : a);
          if (showInactive) return updated.filter(a => String(a.status || "").toLowerCase() === "inactive");
          if (!showAll) return updated.filter(a => String(a.status || "").toLowerCase() === "active");
          return updated;
        });
        refreshAccountList();
      }
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const pageLedgerScope = useMemo(
    () =>
      resolvePageLedgerScope({
        groupOnly: groupOnlyAccountMode,
        selectedGroup,
        companyId,
        sessionMe,
      }),
    [groupOnlyAccountMode, selectedGroup, companyId, sessionMe],
  );

  const appendAccountScopeParams = useCallback(
    (params) => {
      applyTenantLedgerToParams(params, pageLedgerScope);
    },
    [pageLedgerScope],
  );

  const appendCurrencyScopeParams = appendAccountScopeParams;

  const appendModalCurrencyScopeParams = useCallback(
    (params, scopeOverride = undefined) => {
      const modalScope =
        scopeOverride !== undefined
          ? scopeOverride
          : modalLedgerScopeRef.current ?? modalLedgerScope;
      const effective = resolveModalLedgerScope(pageLedgerScope, modalScope);
      applyTenantLedgerToParams(params, effective);
    },
    [pageLedgerScope, modalLedgerScope],
  );

  const resolveActiveModalLedgerScope = useCallback(() => {
    const modal = modalLedgerScopeRef.current ?? modalLedgerScope;
    return resolveModalLedgerScope(pageLedgerScope, modal);
  }, [pageLedgerScope, modalLedgerScope]);

  const loadSelectionMeta = async (
    id,
    isEdit,
    { selectCode = null, ledgerScope = undefined, forcePageLedgerScope = false } = {},
  ) => {
    const scopeForRequest = forcePageLedgerScope
      ? undefined
      : ledgerScope !== undefined
        ? ledgerScope
        : modalLedgerScopeRef.current ?? modalLedgerScope;
    try {
      const currencyParams = new URLSearchParams({ action: "get_available_currencies" });
      if (id) currencyParams.set("account_id", String(id));
      if (forcePageLedgerScope) {
        applyTenantLedgerToParams(currencyParams, pageLedgerScope);
      } else {
        appendModalCurrencyScopeParams(currencyParams, scopeForRequest);
      }
      const [curRes, compRes] = await Promise.all([
        fetch(buildApiUrl(`api/accounts/account_currency_api.php?${currencyParams.toString()}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/accounts/account_company_api.php?action=get_available_companies${id ? `&account_id=${id}` : ""}`), { credentials: "include" }),
      ]);
      const curJ = await curRes.json(); const compJ = await compRes.json();
      if (!curJ.success) {
        notifyApi(curJ.message, "loadLinksFailed", "danger");
        return;
      }
      const rows = curJ.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked }));
      setCurrencies(rows);
      const wantCode = selectCode ? toUpper(String(selectCode)).trim() : "";
      const matched = wantCode ? rows.find((c) => toUpper(c.code).trim() === wantCode) : null;
      if (isEdit) {
        const ids = curJ.data.filter((c) => c.is_linked).map((c) => Number(c.id));
        const base = matched ? [...new Set([...ids, Number(matched.id)])] : ids;
        setSelectedCurrencyIds(base);
        setInitialEditCurrencyIds(ids);
      } else if (matched) {
        setSelectedCurrencyIds((prev) =>
          prev.map(Number).includes(Number(matched.id)) ? prev : [...prev, Number(matched.id)],
        );
      } else {
        setSelectedCurrencyIds(pickDefaultAddCurrencyIds(curJ.data));
      }
      if (compJ.success) {
        const linked = compJ.data.filter(c => c.is_linked).map(c => Number(c.id));
        if (groupOnlyAccountMode) {
          const defaultGroupEntity =
            groupPickerCompanies.find((c) => String(c.group_id || c.company_id || "") === String(selectedGroup || "")) ||
            groupPickerCompanies[0] ||
            null;
          setSelectedCompanyIds(defaultGroupEntity?.id ? [String(defaultGroupEntity.id)] : []);
        } else {
          setSelectedCompanyIds(linked.length ? linked : companyId ? [Number(companyId)] : []);
        }
      }
    } catch { /* silent */ }
  };

  const openAdd = () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    setIsEditMode(false); setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]); setCurrencyInput("");
    setInitialEditCurrencyIds([]);
    setHiddenCurrencyIds([]);
    syncModalLedgerScope(null);
    setAddModalOpen(true);
    if (!groupOnlyAccountMode && companyId) {
      setSelectedCompanyIds([String(companyId)]);
    }
    void loadRoles({ companyId, groupId: selectedGroup });
    loadSelectionMeta(null, false);
  };

  const openCurrencySetting = () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    syncModalLedgerScope(null);
    setCurrencySettingOpen(true);
    void loadSelectionMeta(null, false, { forcePageLedgerScope: true });
    if (settingCurrencyId) void loadCurrencyLinks(settingCurrencyId);
  };

  const clearCurrencySettingSelection = () => {
    setSettingCurrencyId(null);
    setSettingLinked(new Set());
    setSettingInitial(new Set());
  };

  const openEdit = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const detailUrl = new URL(buildApiUrl("api/accounts/getaccount_api.php"));
      detailUrl.searchParams.set("id", String(id));
      appendAccountScopeParams(detailUrl.searchParams);
      detailUrl.searchParams.set("_", String(Date.now()));
      const res = await fetch(detailUrl.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const text = await res.text();
      let json;
      try {
        json = text.trim() ? JSON.parse(text) : { success: false };
      } catch {
        return notify(t("errorLoadingAccount"), "danger");
      }
      if (!json.success) return notifyApi(json.message || json.error, "failedToLoadAccount", "danger");
      const d = json.data;
      setIsEditMode(true);
      setHiddenCurrencyIds([]);
      const ledger = d.ledger_scope && typeof d.ledger_scope === "object" ? d.ledger_scope : null;
      const ledgerGroupCode = String(ledger?.group_code || "").trim().toUpperCase();
      const ledgerScopeForModal =
        ledger?.mode === "group" && ledgerGroupCode
          ? { mode: "group", group_code: ledgerGroupCode }
          : null;
      syncModalLedgerScope(ledgerScopeForModal);
      setForm({ id: d.id, account_id: toUpper(d.account_id), name: toUpper(d.name), role: d.role || "", password: d.password || "", remark: toUpper(d.remark), payment_alert: String(d.payment_alert == 1 ? "1" : "0"), alert_type: d.alert_type || d.alert_day || "", alert_start_date: d.alert_start_date || d.alert_specific_date || "", alert_amount: d.alert_amount || "" });
      await loadRoles({ companyId, groupId: selectedGroup });
      await loadSelectionMeta(id, true, { ledgerScope: ledgerScopeForModal });
      setEditModalOpen(true);
    } catch { notify(t("errorLoadingAccount"), "danger"); }
  };

  const confirmDelete = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData();
      selectedDeleteIds.forEach(id => fd.append("ids[]", id));
      appendAccountScopeParams(fd);
      const res = await fetch(buildApiUrl("api/accounts/delete_accounts_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "deleteFailed", "danger");
      setConfirmDeleteOpen(false);
      setSelectedDeleteIds(new Set());
      notifyApi(json.message, "accountsDeletedSuccessfully");
      refreshAccountList();
    } catch { notify(t("deleteFailed"), "danger"); }
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      notify(t("paymentAlertRequiredFields"), "danger");
      return;
    }
    const amount = normalizeAlertAmount(form.alert_amount);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, k === "alert_amount" ? amount : (v ?? "")));
    if (!groupOnlyAccountMode && scopeCompanyId) {
      fd.set("company_id", String(scopeCompanyId));
    }
    if (!groupOnlyAccountMode && selectedCompanyIds.length) {
      fd.set("company_ids", JSON.stringify(selectedCompanyIds));
    }
    appendAccountScopeParams(fd);
    if (!isEditMode && !groupOnlyAccountMode && companyId) {
      fd.set("company_id", String(companyId));
      if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));
    }
    try {
      const ep = isEditMode ? "api/accounts/update_api.php" : "api/accounts/addaccountapi.php";
      const res = await fetch(buildApiUrl(ep), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "saveFailed", "danger");
      let postSaveCurrencyError = null;
      if (!isEditMode && json?.data?.id && selectedCurrencyIds.length) {
        for (const cid of selectedCurrencyIds) {
          const currencyRes = await fetch(accountCurrencyApiUrl("add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(json.data.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) {
            postSaveCurrencyError = String(currencyJson?.message || "");
            break;
          }
        }
      }
      if (isEditMode && form.id) {
        const before = new Set(initialEditCurrencyIds.map(Number));
        const after = new Set(selectedCurrencyIds.map(Number));
        const toAdd = [...after].filter((id) => !before.has(id));
        const toRemove = [...before].filter((id) => !after.has(id));
        for (const cid of toAdd) {
          const currencyRes = await fetch(accountCurrencyApiUrl("add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(form.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) {
            postSaveCurrencyError = String(currencyJson?.message || "");
            break;
          }
        }
        for (const cid of postSaveCurrencyError ? [] : toRemove) {
          const currencyRes = await fetch(accountCurrencyApiUrl("remove_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(form.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) {
            postSaveCurrencyError = String(currencyJson?.message || "");
            break;
          }
        }
        setInitialEditCurrencyIds([...after]);
        if (settingCurrencyId) void loadCurrencyLinks(settingCurrencyId);
      }
      setAddModalOpen(false); setEditModalOpen(false);
      setHiddenCurrencyIds([]);
      if (postSaveCurrencyError) {
        notify(
          t("accountSavedCurrencySyncFailed", {
            detail: translateAccountApiMessage(lang, postSaveCurrencyError, "saveFailed"),
          }),
          "danger",
        );
      } else {
        notify(t("accountSavedSuccessfully"));
      }
      refreshAccountList();
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const createCurrency = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const code = toUpper(currencyInput).trim(); if (!code) return;
    const existing = currencies.find((c) => toUpper(c.code).trim() === code);
    if (existing) {
      const existingId = Number(existing.id);
      setHiddenCurrencyIds((prev) => prev.filter((id) => Number(id) !== existingId));
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
      setCurrencyInput("");
      return;
    }
    try {
      const modalScope = currencySettingOpen ? pageLedgerScope : resolveActiveModalLedgerScope();
      const payload = { code };
      if (modalScope.groupId) payload.group_id = modalScope.groupId;
      if (modalScope.ledger === "group") {
        payload.group_only = true;
      } else if (modalScope.companyId) {
        payload.company_id = modalScope.companyId;
      }
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const newId = Number(json.data.id);
        setCurrencies((prev) => [...prev, { id: newId, code: json.data.code, is_linked: false }]);
        setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
        setCurrencyInput("");
      } else {
        const msg = String(json.message || json.error || "");
        if (/already exists/i.test(msg)) {
          await loadSelectionMeta(isEditMode && form.id ? form.id : null, isEditMode, {
            selectCode: code,
            ledgerScope: currencySettingOpen ? undefined : modalLedgerScopeRef.current ?? modalLedgerScope,
            forcePageLedgerScope: currencySettingOpen,
          });
          setCurrencyInput("");
          return;
        }
        notifyApi(json.message, "createFailed", "danger");
      }
    } catch { notify(t("createFailed"), "danger"); }
  };

  const accountCurrencyApiUrl = useCallback(
    (action) => {
      const params = new URLSearchParams({ action });
      if (isEditMode && form.id) params.set("account_id", String(form.id));
      appendModalCurrencyScopeParams(params);
      return buildApiUrl(`api/accounts/account_currency_api.php?${params.toString()}`);
    },
    [appendModalCurrencyScopeParams, isEditMode, form.id],
  );

  const fetchAccountsUsingCurrency = async (currencyId) => {
    try {
      const params = new URLSearchParams({
        action: "get_linked_accounts_by_currency",
        currency_id: String(currencyId),
      });
      appendModalCurrencyScopeParams(params);
      const res = await fetch(
        buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`),
        { method: "POST", credentials: "include" },
      );
      const json = await res.json();
      if (!json.success) return [];
      const fromApi = Array.isArray(json.data?.linked_accounts) ? json.data.linked_accounts : [];
      if (fromApi.length > 0) {
        return fromApi.map((a) => ({
          id: Number(a.id),
          name: String(a.name ?? ""),
          account_id: String(a.account_id ?? ""),
        }));
      }
      const linkedIds = new Set((json.data?.linked_account_ids || []).map(Number));
      return accounts
        .filter((a) => linkedIds.has(Number(a.id)))
        .map((a) => ({
          id: Number(a.id),
          name: String(a.name ?? ""),
          account_id: String(a.account_id ?? ""),
        }));
    } catch {
      return [];
    }
  };

  const handleCurrencyDeleteBlocked = async (currencyId, json, msg) => {
    const editingAccountId = isEditMode ? Number(form.id) : 0;
    let accountsInUse = Array.isArray(json?.data?.accounts_in_use) ? json.data.accounts_in_use : [];
    if (accountsInUse.length === 0) {
      accountsInUse = await fetchAccountsUsingCurrency(currencyId);
    }
    if (accountsInUse.length === 0) {
      accountsInUse = parseAccountsFromCurrencyDeleteMessage(msg);
    }
    if (editingAccountId > 0) {
      accountsInUse = accountsInUse.filter((a) => Number(a.id) !== editingAccountId);
    }
    const apiData =
      accountsInUse.length > 0 ? { ...(json?.data || {}), accounts_in_use: accountsInUse } : json?.data ?? null;
    notifyApi(msg, "failedDeleteCurrency", "danger", {}, apiData);
  };

  /** Permanently delete currency; only when deselected. Unlink from current account if still linked in DB. */
  const removeModalCurrency = async (currencyId) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const id = Number(currencyId);
    const accountId = isEditMode ? Number(form.id) : 0;

    if (selectedCurrencyIds.map(Number).includes(id)) {
      notify(t("deselectCurrencyBeforeDelete"), "danger");
      return;
    }

    const dropCurrencyFromUi = () => {
      setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
      setHiddenCurrencyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setCurrencies((prev) => prev.filter((c) => Number(c.id) !== id));
    };

    const unlinkCurrentAccountFromCurrency = async () => {
      const wasSavedOnAccount = accountId > 0 && initialEditCurrencyIds.map(Number).includes(id);

      if (!accountId) return true;

      let needsUnlink = wasSavedOnAccount;
      if (!needsUnlink) {
        const using = await fetchAccountsUsingCurrency(id);
        needsUnlink = using.some((a) => Number(a.id) === accountId);
      }
      if (!needsUnlink) {
        if (wasSavedOnAccount) {
          setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
        }
        return true;
      }

      try {
        const res = await fetch(accountCurrencyApiUrl("remove_currency"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, currency_id: id }),
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          notifyApi(json.message, "saveFailed", "danger");
          return false;
        }
        setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
        setCurrencies((prev) =>
          prev.map((c) => (Number(c.id) === id ? { ...c, is_linked: false } : c)),
        );
        return true;
      } catch {
        notify(t("saveFailed"), "danger");
        return false;
      }
    };

    const unlinked = await unlinkCurrentAccountFromCurrency();
    if (!unlinked) return;

    let otherAccountsInUse = await fetchAccountsUsingCurrency(id);
    if (accountId > 0) {
      otherAccountsInUse = otherAccountsInUse.filter((a) => Number(a.id) !== accountId);
    }

    try {
      const deleteUrl = new URL(buildApiUrl("api/accounts/delete_currency_api.php"));
      appendModalCurrencyScopeParams(deleteUrl.searchParams);
      const deletePayload = { id };
      const modalScope = resolveActiveModalLedgerScope();
      if (modalScope.ledger === "group") {
        deletePayload.group_only = true;
        if (modalScope.groupId) deletePayload.group_id = modalScope.groupId;
      } else {
        if (modalScope.companyId) deletePayload.company_id = modalScope.companyId;
        if (modalScope.groupId) deletePayload.group_id = modalScope.groupId;
      }
      const res = await fetch(deleteUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deletePayload),
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        dropCurrencyFromUi();
        notifyApi(json.message, "currencyDeleted", "success");
        return;
      }
      const msg = String(json.message || json.error || "");
      const apiData =
        otherAccountsInUse.length > 0
          ? { ...(json?.data || {}), accounts_in_use: otherAccountsInUse }
          : json?.data ?? null;
      await handleCurrencyDeleteBlocked(id, { ...json, data: apiData }, msg);
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
    }
  };

  const loadCurrencyLinks = async (curId) => {
    try {
      const params = new URLSearchParams({ action: "get_linked_accounts_by_currency", currency_id: String(curId) });
      appendCurrencyScopeParams(params);
      const res = await fetch(buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`), { method: "POST", credentials: "include" });
      const json = await res.json();
      const ids = new Set((json.data?.linked_account_ids || []).map(Number));
      setSettingLinked(ids); setSettingInitial(new Set(ids));
    } catch { notify(t("loadLinksFailed"), "danger"); }
  };

  const saveCurrencySetting = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const linked = [], unlinked = [];
    accounts.forEach(a => {
      const id = Number(a.id); const was = settingInitial.has(id), now = settingLinked.has(id);
      if (now && !was) linked.push(id); if (!now && was) unlinked.push(id);
    });
    try {
      const params = new URLSearchParams({ action: "bulk_update" });
      appendCurrencyScopeParams(params);
      const res = await fetch(buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency_id: settingCurrencyId, linked_account_ids: linked, unlinked_account_ids: unlinked }), credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notifyApi(json.message, "saveFailed", "danger");
      setSettingInitial(new Set(settingLinked));
      setCurrencySettingOpen(false);
      notify(t("currencySettingsSaved"));
      refreshAccountList();
      if (editModalOpen && form.id) void loadSelectionMeta(form.id, true);
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const buildLinkScopePayload = useCallback(() => {
    const payload = {};
    const gid =
      (selectedGroup && String(selectedGroup).trim().toUpperCase()) ||
      (isGroupLogin(sessionMe) ? getLoginIdentifier(sessionMe) : null);
    if (gid) payload.group_id = gid;
    if (groupOnlyAccountMode) {
      payload.group_only = true;
    } else if (companyId) {
      payload.company_id = Number(companyId);
    } else if (scopeCompanyId) {
      payload.company_id = Number(scopeCompanyId);
    }
    return payload;
  }, [selectedGroup, groupOnlyAccountMode, companyId, scopeCompanyId, sessionMe]);

  const openLink = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      if (!companyId && !(groupOnlyAccountMode && selectedGroup)) {
        return notify(t("pleaseSelectCompanyFirst"), "danger");
      }
      setLinkingAccountId(Number(id));
      setLinkType("bidirectional");
      setLinkSearchTerm("");
      const allUrl = groupOnlyAccountMode && selectedGroup
        ? buildGroupAccountsUrl(selectedGroup, "", false, true, { groupOnly: true })
        : buildAccountsUrl(companyId ?? scopeCompanyId, "", false, true);
      const linkedUrl = new URL(buildApiUrl("api/accounts/account_link_api.php"));
      linkedUrl.searchParams.set("action", "get_linked_accounts");
      linkedUrl.searchParams.set("account_id", String(id));
      const linkScope = buildLinkScopePayload();
      if (linkScope.group_id) linkedUrl.searchParams.set("group_id", String(linkScope.group_id));
      if (linkScope.group_only) linkedUrl.searchParams.set("group_only", "1");
      if (linkScope.company_id) linkedUrl.searchParams.set("company_id", String(linkScope.company_id));
      const [allRes, linkedRes] = await Promise.all([
        fetch(allUrl.toString(), { credentials: "include" }),
        fetch(linkedUrl.toString(), { credentials: "include" }),
      ]);
      const allJson = await allRes.json();
      const linkedJson = await linkedRes.json();
      const pool = Array.isArray(allJson?.data?.accounts) ? allJson.data.accounts : [];
      setLinkAccountsPool(pool);
      const types = linkedJson?.data?.link_types_map || {};
      setLinkTypeMap(types);
      const initial = new Set(
        (Array.isArray(linkedJson?.data?.accounts) ? linkedJson.data.accounts : [])
          .filter((a) => types[a.id] === "bidirectional")
          .map((a) => Number(a.id))
      );
      setSelectedLinkedIds(initial);
      setLinkModalOpen(true);
    } catch {
      notify(t("failedOpenLinkModal"), "danger");
    }
  };

  useEffect(() => {
    if (!linkModalOpen) return;
    const next = new Set(
      Object.entries(linkTypeMap)
        .filter(([, type]) => type === linkType)
        .map(([id]) => Number(id))
    );
    setSelectedLinkedIds(next);
  }, [linkType, linkTypeMap, linkModalOpen]);

  const saveLinks = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!linkingAccountId || (!companyId && !(groupOnlyAccountMode && selectedGroup))) return;
    try {
      const linkScope = buildLinkScopePayload();
      const refUrl = new URL(buildApiUrl("api/accounts/account_link_api.php"));
      refUrl.searchParams.set("action", "get_linked_accounts");
      refUrl.searchParams.set("account_id", String(linkingAccountId));
      if (linkScope.group_id) refUrl.searchParams.set("group_id", String(linkScope.group_id));
      if (linkScope.group_only) refUrl.searchParams.set("group_only", "1");
      if (linkScope.company_id) refUrl.searchParams.set("company_id", String(linkScope.company_id));
      const refRes = await fetch(refUrl.toString(), { credentials: "include" });
      const refJson = await refRes.json();
      if (!refJson?.success) {
        notifyApi(refJson?.message, "failedSaveAccountLinks", "danger");
        return;
      }
      const linkScopeCompanyId = Number(refJson?.data?.company_id) || Number(linkScope.company_id) || 0;
      if (!Number.isFinite(linkScopeCompanyId) || linkScopeCompanyId <= 0) {
        notify(t("pleaseSelectCompanyFirst"), "danger");
        return;
      }
      const typesMap = refJson?.data?.link_types_map || {};
      const currentTypeIds = new Set(
        (Array.isArray(refJson?.data?.accounts) ? refJson.data.accounts : [])
          .filter((a) => typesMap[a.id] === linkType)
          .map((a) => Number(a.id))
      );
      const desiredIds = new Set([...selectedLinkedIds]);
      const toAdd = [...desiredIds].filter((id) => !currentTypeIds.has(id));
      const toRemove = [...currentTypeIds].filter((id) => !desiredIds.has(id));

      for (const linkedId of toRemove) {
        await fetch(buildApiUrl("api/accounts/account_link_api.php?action=unlink_accounts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id_1: Number(linkingAccountId),
            account_id_2: Number(linkedId),
            company_id: linkScopeCompanyId,
            ...linkScope,
          }),
          credentials: "include",
        });
      }
      for (const linkedId of toAdd) {
        await fetch(buildApiUrl("api/accounts/account_link_api.php?action=link_accounts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id_1: Number(linkingAccountId),
            account_id_2: Number(linkedId),
            company_id: linkScopeCompanyId,
            ...linkScope,
            link_type: linkType,
            source_account_id: linkType === "unidirectional" ? Number(linkingAccountId) : null,
          }),
          credentials: "include",
        });
      }
      if (toAdd.length === 0 && toRemove.length === 0 && desiredIds.size > 0) {
        for (const linkedId of desiredIds) {
          await fetch(buildApiUrl("api/accounts/account_link_api.php?action=update_link_type"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account_id_1: Number(linkingAccountId),
              account_id_2: Number(linkedId),
              company_id: linkScopeCompanyId,
              ...linkScope,
              link_type: linkType,
              source_account_id: linkType === "unidirectional" ? Number(linkingAccountId) : null,
            }),
            credentials: "include",
          });
        }
      }
      setLinkModalOpen(false);
      notify(t("accountLinksSavedSuccessfully"));
      refreshAccountList();
    } catch {
      notify(t("failedSaveAccountLinks"), "danger");
    }
  };

  const handleSort = (column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
  };

  const renderSortIcon = (column) => (
    <span className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`} aria-hidden="true">
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );

  const renderSortableHeader = (label, column) => (
    <div
      className="account-header-item account-header-sortable"
      role="button"
      tabIndex={0}
      onClick={() => handleSort(column)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSort(column);
        }
      }}
    >
      <span>{label}</span>
      {renderSortIcon(column)}
    </div>
  );

  return (
    <>
      <div className="container">
        <div className="content">
          <div className="action-buttons-container">
            <div className="action-buttons">
              <div className="account-toolbar-top-row">
                <div className="action-controls-row account-toolbar-primary">
                <button type="button" className="btn btn-add" disabled={accountMutationsBlocked} onClick={openAdd}>
                  <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  {t("addAccount")}
                </button>
                <div className="search-container userlist-search-bar">
                  <span className="userlist-search-bar__icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  </span>
                  <input
                    id="accountlist-search-input"
                    type="text"
                    className="search-input userlist-search-input"
                    placeholder={t("searchByAccountOrName")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(toUpper(e.target.value))}
                  />
                </div>
                <div className="userlist-filter-chips" role="group">
                  <button
                    type="button"
                    className={`user-filter-chip${showInactive && !showAll ? " is-selected" : ""}`}
                    aria-pressed={showInactive && !showAll}
                    onClick={() => {
                      if (showInactive && !showAll) setShowInactive(false);
                      else {
                        setShowInactive(true);
                        setShowAll(false);
                      }
                    }}
                  >
                    <span className="user-filter-chip__dot" aria-hidden>
                      {showInactive && !showAll ? (
                        <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 12l4 4 8-8" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="user-filter-chip__label">{t("showInactive")}</span>
                  </button>
                  <button
                    type="button"
                    className={`user-filter-chip${showAll ? " is-selected" : ""}`}
                    aria-pressed={showAll}
                    onClick={() => {
                      if (showAll) setShowAll(false);
                      else {
                        setShowAll(true);
                        setShowInactive(false);
                      }
                    }}
                  >
                    <span className="user-filter-chip__dot" aria-hidden>
                      {showAll ? (
                        <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 12l4 4 8-8" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="user-filter-chip__label">{t("showAll")}</span>
                  </button>
                </div>
                </div>
                <div className="user-toolbar-actions-right">
                  <button type="button" className="btn btn-currency-setting" disabled={accountMutationsBlocked} onClick={openCurrencySetting}>
                    {t("currencySetting")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-delete"
                    disabled={!selectedDeleteIds.size || accountMutationsBlocked}
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    {t("deleteWithCount", { count: selectedDeleteIds.size })}
                  </button>
                </div>
              </div>
            </div>
            <GcInlineFilterPanel
              t={t}
              groupIds={groupIds}
              groupsAllMode={groupsAllMode}
              selectedGroup={selectedGroup}
              onPickAllGroups={handlePickAllGroups}
              onPickGroup={onPickGroupPill}
              companiesForPicker={inlineCompaniesForPicker}
              groupAllMode={groupAllMode}
              pickerCompanyId={companyId}
              onPickAllInGroup={handlePickAllInGroup}
              onPickCompany={onPickCompanyPill}
              onClearCompanyPill={clearCompanyPillSelection}
              allowCompanyDeselect={canClearCompanySelection(sessionMe, selectedGroup)}
              switchingCompany={false}
              showAllOption={false}
            />
          </div>

          <div className="account-table-wrapper account-list-table">
            <div className="account-list-table-inner">
            <div className="account-table-header account-list-table-header">
              <div className="account-header-item">{t("no")}</div>
              {renderSortableHeader(t("account"), "account")}
              {renderSortableHeader(t("name"), "name")}
              {renderSortableHeader(t("role"), "role")}
              {renderSortableHeader(t("alert"), "alert")}
              {renderSortableHeader(t("status"), "status")}
              {renderSortableHeader(t("lastLogin"), "lastLogin")}
              {renderSortableHeader(t("remark"), "remark")}
              <div className="account-header-item">{t("action")}</div>
            </div>
            <div className={`account-cards${showAll ? " account-cards--show-all" : ""}`}>
              {pageRows.map((a, idx) => {
                const alertOn = String(a.payment_alert) === "1";
                const isInactive = String(a.status || "").toLowerCase() === "inactive";
                return (
                  <div className="account-card account-list-row" key={a.id}>
                    <div className="account-card-item">{showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                    <div className="account-card-item">{toUpper(a.account_id)}</div>
                    <div className="account-card-item">{toUpper(a.name)}</div>
                    <div className="account-card-item"><span className={`account-role-badge account-role-${String(a.role || "").toLowerCase().replace(/\s+/g, "-")}`}>{toUpper(a.role) === "UPLINE" ? t("supplier") : toUpper(a.role)}</span></div>
                    <div className="account-card-item"><span className={`account-role-badge ${alertOn ? "account-status-active" : "account-status-inactive"}${accountMutationsBlocked ? "" : " status-clickable"}`} onClick={accountMutationsBlocked ? () => notify(t("readOnlyActionBlocked"), "danger") : () => togglePaymentAlert(a.id)} style={accountMutationsBlocked ? { cursor: "not-allowed" } : undefined}>{alertOn ? "ON" : "OFF"}</span></div>
                    <div className="account-card-item"><span className={`account-role-badge ${isInactive ? "account-status-inactive" : "account-status-active"}${accountMutationsBlocked ? "" : " status-clickable"}`} onClick={accountMutationsBlocked ? () => notify(t("readOnlyActionBlocked"), "danger") : () => toggleAccountStatus(a.id)} style={accountMutationsBlocked ? { cursor: "not-allowed" } : undefined}>{toUpper(a.status)}</span></div>
                    <div className="account-card-item">{toUpper(a.last_login)}</div>
                    <div className="account-card-item">{toUpper(a.remark)}</div>
                    <div className="account-card-item">
                      <button type="button" className="account-edit-btn" disabled={accountMutationsBlocked} onClick={() => openEdit(a.id)}><img src={assetUrl("images/edit.svg")} alt={t("edit")} /></button>
                      <button type="button" className="account-edit-btn" disabled={accountMutationsBlocked} onClick={() => openLink(a.id)} style={{ marginLeft: 5 }} title={t("linkAccountTitle")}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                      {isInactive && <input type="checkbox" style={{ marginLeft: 10 }} disabled={accountMutationsBlocked} checked={selectedDeleteIds.has(Number(a.id))} onChange={(e) => setSelectedDeleteIds(prev => { const n = new Set(prev); if (e.target.checked) n.add(Number(a.id)); else n.delete(Number(a.id)); return n; })} />}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
          {!showAll && (
            <div className="account-pagination-container">
              <button className="account-pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
              <span className="account-pagination-info">{t("paginationOf", { page: currentPage, total: totalPages })}</span>
              <button className="account-pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
            </div>
          )}
        </div>
      </div>

      {toast && typeof document !== "undefined" && document.body
        ? createPortal(
            <div
              id="accountNotificationContainer"
              className="account-notification-container"
              style={{
                zIndex:
                  addModalOpen || editModalOpen || linkModalOpen || confirmDeleteOpen || currencySettingOpen
                    ? processNotificationAboveAccountZIndex
                    : processNotificationZIndex,
              }}
            >
              <div className={`account-notification account-notification-${toast.type} show`}>{toast.message}</div>
            </div>,
            document.body
          )
        : null}

      <AccountModal
        open={addModalOpen || editModalOpen}
        title={isEditMode ? t("editAccount") : t("addAccount")}
        isEditMode={isEditMode}
        form={form}
        setForm={setForm}
        orderedRoles={orderedRoles}
        currencies={accountModalCurrencies}
        companies={modalPickerCompanies}
        selectedCurrencyIds={selectedCurrencyIds}
        setSelectedCurrencyIds={setSelectedCurrencyIds}
        selectedCompanyIds={selectedCompanyIds}
        setSelectedCompanyIds={setSelectedCompanyIds}
        currencyInput={currencyInput}
        setCurrencyInput={setCurrencyInput}
        onCreateCurrency={(e) => {
          // Allow UI reuse without forcing event handling conventions.
          if (e?.preventDefault) e.preventDefault();
          createCurrency();
        }}
        onRemoveCurrency={removeModalCurrency}
        currencyDeleteOnlyWhenDeselected
        onSubmit={saveForm}
        onClose={() => {
          setAddModalOpen(false);
          setEditModalOpen(false);
          setHiddenCurrencyIds([]);
          syncModalLedgerScope(null);
        }}
        groupPickerMode={groupOnlyAccountMode}
        t={t}
      />
      <AccountConfirmModal open={confirmDeleteOpen} message={t("deleteConfirmMessage", { count: selectedDeleteIds.size })} onConfirm={confirmDelete} onClose={() => setConfirmDeleteOpen(false)} t={t} />
      <CurrencySettingModal open={currencySettingOpen} onClose={() => setCurrencySettingOpen(false)} currencies={currencies} settingCurrencyId={settingCurrencyId} setSettingCurrencyId={setSettingCurrencyId} settingLinked={settingLinked} setSettingLinked={setSettingLinked} settingSearch={settingSearch} setSettingSearch={setSettingSearch} settingRole={settingRole} setSettingRole={setSettingRole} onLoadCurrencyLinks={loadCurrencyLinks} onClearCurrencySelection={clearCurrencySettingSelection} onSave={saveCurrencySetting} accounts={accounts} roles={roles} currencyInput={currencyInput} setCurrencyInput={setCurrencyInput} onCreateCurrency={createCurrency} t={t} />
      <LinkAccountModal open={linkModalOpen} accounts={linkAccountsPool} currentAccountId={linkingAccountId} selectedIds={selectedLinkedIds} setSelectedIds={setSelectedLinkedIds} linkType={linkType} setLinkType={setLinkType} searchTerm={linkSearchTerm} setSearchTerm={setLinkSearchTerm} onSave={saveLinks} onClose={() => setLinkModalOpen(false)} t={t} />
    </>
  );
}
