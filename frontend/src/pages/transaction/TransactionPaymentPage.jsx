import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import AccountSelect from "./AccountSelect.jsx";
import TransactionAddSection from "./components/TransactionAddSection.jsx";
import TransactionHeader from "./components/TransactionHeader.jsx";
import TransactionHistoryModal from "./components/TransactionHistoryModal.jsx";
import TransactionSearchSection from "./components/TransactionSearchSection.jsx";
import TransactionTablesSection from "./components/TransactionTablesSection.jsx";
import {
  approveContra,
  getAccounts,
  getCategories,
  getCompanyCurrencies,
  getHistory,
  getUserCurrencyOrder,
  loadContraInbox,
  rejectContra,
  saveUserCurrencyOrder,
  searchTransactions as searchTransactionsApi,
  submitTransaction,
} from "./transactionApi.js";
import {
  buildClientRequestId,
  formatDmy,
  formatPaymentHistoryMoney,
  formatRateAmount,
  parseBalanceValue,
  parseRateExpression,
  toUpperDisplay,
} from "./transactionFormat.js";
import { buildRatePayload, toNumberLike } from "./transactionSubmitHelpers.js";
import { installTransactionExcelCopy } from "./transactionExcelCopy.js";
import {
  TRANSACTION_CURRENCY_FILTER_KEY_PREFIX,
  TX_DATA_CHANGED_EVENT,
  TX_LIST_INVALIDATE_LS_KEY,
  applyPaymentWinLossFilters,
  applyZeroBalanceFilter,
  buildTxListSessionKey,
  calculateTotals,
  countDisplayedRows,
  getRoleClass,
  mergeTotals,
  normalizeRateRowsByCrDr,
  orderCurrencyRows,
  readTransactionCurrencyFilterState,
  sortByRole,
} from "./transactionPaymentLogic.js";
import {
  companyButtonStyle,
  injectStylesheet,
  loadTxScriptOnce,
  parseDmyToDate,
} from "./transactionPaymentPageUtils.js";

/** 与 transaction.php / TRANSACTION_PAGE.showDescriptionColumn 一致（PHP 默认为 true）。 */
const TRANSACTION_SHOW_DESCRIPTION_COLUMN = true;

export default function TransactionPaymentPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filterSnapshot, setFilterSnapshot] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchState, setSearchState] = useState({
    showName: false,
    showCaptureOnly: false,
    showPaymentOnly: false,
    showZeroBalance: false,
  });
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const categoryAllCheckboxRef = useRef(null);
  const [tablesVisible, setTablesVisible] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [history, setHistory] = useState({ open: false, title: "", rows: [], loading: false });
  const [contraInbox, setContraInbox] = useState({ open: false, loading: false, items: [] });
  const [toast, setToast] = useState([]);

  const [txType, setTxType] = useState("CONTRA");
  const [txDate, setTxDate] = useState(null);
  const [txToAccount, setTxToAccount] = useState(null);
  const [txFromAccount, setTxFromAccount] = useState(null);
  const [txCurrency, setTxCurrency] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txRemark, setTxRemark] = useState("");
  const [txConfirm, setTxConfirm] = useState(false);
  const [winLoseSide, setWinLoseSide] = useState("WIN");
  const [submitting, setSubmitting] = useState(false);
  const [accountOptions, setAccountOptions] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [currencyRowsOrdered, setCurrencyRowsOrdered] = useState([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [rawSearchData, setRawSearchData] = useState(null);

  const searchAbortRef = useRef(null);
  const lastCompletedSearchKeyRef = useRef("");
  const lastCompletedSearchTsRef = useRef(0);
  const draggedCurrencyRef = useRef(null);
  const initialSearchDoneRef = useRef(false);
  const lastSearchCommitMsRef = useRef(0);
  const prevTxTypeRef = useRef(txType);
  const fpTxDateRef = useRef(null);
  const fpRateDateRef = useRef(null);
  const txDateRangePickerReadyRef = useRef(false);
  const categoryChangedByUserRef = useRef(false);

  const [rateDate, setRateDate] = useState(null);
  const [rateToAccount, setRateToAccount] = useState(null); // UI: Select To Account (id=rate_account_from)
  const [rateFromAccount, setRateFromAccount] = useState(null); // UI: Select From Account (id=rate_account_to)
  const [rateCurrencyFrom, setRateCurrencyFrom] = useState("");
  const [rateCurrencyTo, setRateCurrencyTo] = useState("");
  const [rateCurrencyFromAmount, setRateCurrencyFromAmount] = useState("");
  const [rateExchangeRateRaw, setRateExchangeRateRaw] = useState("");
  const [rateCurrencyToAmount, setRateCurrencyToAmount] = useState("");

  const [rateTransferToAccount, setRateTransferToAccount] = useState(null); // UI: Select To Account (id=rate_transfer_from_account)
  const [rateTransferFromAccount, setRateTransferFromAccount] = useState(null); // UI: Select From Account (id=rate_transfer_to_account)

  const [rateMiddlemanAccount, setRateMiddlemanAccount] = useState(null);
  const [rateMiddlemanRate, setRateMiddlemanRate] = useState("");
  const [rateMiddlemanAmount, setRateMiddlemanAmount] = useState("");

  const closeToastTimer = useRef(null);

  const todayDmy = useMemo(() => formatDmy(new Date()), []);
  const dateRangeText = useMemo(() => `${todayDmy} - ${todayDmy}`, [todayDmy]);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page");
    document.body.classList.add("dashboard-page", "transaction-page");
    return () => {
      document.body.classList.remove("transaction-page", "page-ready");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canPay = hasFull || perms.includes("payment");
        if (!canPay) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const companiesJson = await companiesRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        if (queryCompany && rows.some((c) => Number(c.id) === Number(queryCompany))) {
          const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${queryCompany}`), {
            credentials: "include",
          });
          const sj = await sync.json();
          if (!sync.ok || !sj.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          } else {
            notifyCompanySessionUpdated();
          }
        }

        const current = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && current?.group_id && String(current.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && current?.group_id?.trim()) {
          selGroup = String(current.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

        if (!cancelled) {
          const snapRows = rows.filter((c) => c.company_id && String(c.company_id).trim() !== "");
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            snapCompanies: snapRows,
            snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
            viewerRole: String(u.role || "").toLowerCase(),
          });
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const persistCurrencyFilter = useCallback((companyId, showAll, sel) => {
    if (!companyId) return;
    try {
      localStorage.setItem(
        TRANSACTION_CURRENCY_FILTER_KEY_PREFIX + companyId,
        JSON.stringify({ showAll: !!showAll, currencies: [...(sel || [])] }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const currencyInitCompanyRef = useRef(null);

  const applyCurrencyData = useCallback(
    (companyId, orderedRows, _orderPayload, { resetSelection }) => {
      const rows = Array.isArray(orderedRows) ? orderedRows : [];
      setCurrencyRowsOrdered(rows);
      const codes = rows.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);
      setCurrencyOptions([...new Set(codes)]);

      let preferredDefault = null;
      try {
        preferredDefault =
          String(localStorage.getItem(`transaction_default_currency_${companyId || 0}`) || "")
            .trim()
            .toUpperCase() || null;
      } catch {
        preferredDefault = null;
      }

      if (!resetSelection) {
        const pickDefault =
          (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
          rows[0];
        if (pickDefault?.code) {
          setTxCurrency((v) => v || pickDefault.code);
          setRateCurrencyFrom((v) => v || pickDefault.code);
          if (codes.includes("MYR")) setRateCurrencyTo((v) => v || "MYR");
        }
        return;
      }

      const saved = readTransactionCurrencyFilterState(companyId);
      let nextShowAll = false;
      let nextSel = [];

      if (saved?.showAll) {
        nextShowAll = true;
        nextSel = [];
      } else if (saved?.currencies?.length) {
        const valid = saved.currencies.filter((code) => rows.some((c) => String(c.code) === String(code)));
        if (valid.length > 0) nextSel = valid;
      }

      if (!nextShowAll && nextSel.length === 0 && rows.length > 0) {
        const pick =
          (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
          rows[0];
        if (pick?.code) nextSel = [pick.code];
      }

      setShowAllCurrencies(nextShowAll);
      setSelectedCurrencies(nextSel);
      persistCurrencyFilter(companyId, nextShowAll, nextSel);

      const pickDefault =
        (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
        rows[0];
      if (pickDefault?.code) {
        setTxCurrency(pickDefault.code);
        setRateCurrencyFrom(pickDefault.code);
        if (codes.includes("MYR")) setRateCurrencyTo("MYR");
      }
    },
    [persistCurrencyFilter],
  );

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    let cancelled = false;
    (async () => {
      await injectStylesheet("https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap");
      await injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css");
      await injectStylesheet(assetUrl("css/transaction.css"));
      await injectStylesheet(assetUrl("css/date-range-picker.css"));
      await injectStylesheet(assetUrl("css/global-13inch.css"));

      setDateFrom((v) => v || todayDmy);
      setDateTo((v) => v || todayDmy);
      setTxDate((v) => v || todayDmy);
      setRateDate((v) => v || todayDmy);

      try {
        const c = await getCategories();
        const roles = Array.isArray(c?.data) ? c.data : Array.isArray(c) ? c : [];
        if (!cancelled) setCategories(roles.map((r) => String(r).toUpperCase()));
      } catch {
        if (!cancelled) setCategories([]);
      }

      try {
        const cid = filterSnapshot.companyId;
        const [acc, cur, ord] = await Promise.all([
          getAccounts({ companyId: cid }),
          getCompanyCurrencies({ companyId: cid }),
          getUserCurrencyOrder(),
        ]);
        if (cancelled) return;
        setAccountOptions(Array.isArray(acc?.data) ? acc.data : []);
        const rawCur = Array.isArray(cur?.data) ? cur.data : [];
        const ordered = orderCurrencyRows(rawCur, ord);
        const resetSelection = currencyInitCompanyRef.current !== cid;
        currencyInitCompanyRef.current = cid;
        applyCurrencyData(cid, ordered, ord, { resetSelection });
      } catch {
        if (!cancelled) {
          setAccountOptions([]);
          setCurrencyOptions([]);
          setCurrencyRowsOrdered([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, filterSnapshot, todayDmy, applyCurrencyData]);

  useEffect(() => {
    if (txType !== "RATE") return;
    const parsed = parseRateExpression(rateExchangeRateRaw);
    const fromAmt = Number(String(rateCurrencyFromAmount || "").replace(/,/g, "").trim());
    if (!parsed.valid || !Number.isFinite(fromAmt) || fromAmt <= 0) {
      setRateCurrencyToAmount("");
      return;
    }
    const toAmt = fromAmt * parsed.value;
    setRateCurrencyToAmount(formatRateAmount(toAmt));
  }, [txType, rateExchangeRateRaw, rateCurrencyFromAmount]);

  useEffect(() => {
    if (txType !== "RATE") return;
    const base = Number(String(rateCurrencyFromAmount || "").replace(/,/g, "").trim());
    const mult = Number(String(rateMiddlemanRate || "").replace(/,/g, "").trim());
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(mult) || mult <= 0) {
      setRateMiddlemanAmount("");
      return;
    }
    setRateMiddlemanAmount(formatRateAmount(base * mult));
  }, [txType, rateCurrencyFromAmount, rateMiddlemanRate]);

  const pushToast = useCallback((message, type = "info") => {
    setToast((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }];
      return next.slice(-2);
    });
    if (closeToastTimer.current) clearTimeout(closeToastTimer.current);
    closeToastTimer.current = setTimeout(() => {
      setToast((prev) => prev.slice(1));
    }, 2000);
  }, []);

  const canApproveContra = useMemo(() => {
    const r = filterSnapshot?.viewerRole || "";
    return ["manager", "admin", "owner"].includes(r);
  }, [filterSnapshot]);

  const tablePresentation = useMemo(() => {
    if (!rawSearchData) {
      return {
        mode: "none",
        defaultLeft: [],
        defaultRight: [],
        totalsLeft: calculateTotals([]),
        totalsRight: calculateTotals([]),
        totalsSummary: mergeTotals(calculateTotals([]), calculateTotals([])),
        grouped: [],
        singleCurrencyTitle: null,
      };
    }
    const rawLeft = [...(rawSearchData.left_table || [])];
    const rawRight = [...(rawSearchData.right_table || [])];
    const pf = applyPaymentWinLossFilters(rawLeft, rawRight, {
      showPaymentOnly: searchState.showPaymentOnly,
      showCaptureOnly: searchState.showCaptureOnly,
    });
    const z = applyZeroBalanceFilter(pf.filteredLeft, pf.filteredRight, searchState.showZeroBalance);
    const norm = normalizeRateRowsByCrDr(z.left, z.right, txType === "RATE");
    let sortedLeft = sortByRole(norm.leftRows);
    let sortedRight = sortByRole(norm.rightRows);
    const totalsLeft = calculateTotals(sortedLeft);
    const totalsRight = calculateTotals(sortedRight);
    const totalsSummary = mergeTotals(totalsLeft, totalsRight);

    const multi = showAllCurrencies || selectedCurrencies.length > 1;
    const codesOrdered = currencyRowsOrdered.map((c) => String(c.code || "").toUpperCase().trim()).filter(Boolean);

    if (!multi) {
      const title =
        selectedCurrencies.length === 1 ? `Currency: ${selectedCurrencies[0]}` : null;
      return {
        mode: "default",
        defaultLeft: sortedLeft,
        defaultRight: sortedRight,
        totalsLeft,
        totalsRight,
        totalsSummary,
        grouped: [],
        singleCurrencyTitle: title,
      };
    }

    const groupedMap = {};
    const pushRow = (row, side) => {
      const cur = row.currency || "UNKNOWN";
      if (!groupedMap[cur]) groupedMap[cur] = { left: [], right: [] };
      groupedMap[cur][side].push(row);
    };
    sortedLeft.forEach((row) => pushRow(row, "left"));
    sortedRight.forEach((row) => pushRow(row, "right"));

    let orderedCurrs = [];
    codesOrdered.forEach((code) => {
      if (groupedMap[code]) orderedCurrs.push(code);
    });
    Object.keys(groupedMap).forEach((code) => {
      if (!orderedCurrs.includes(code)) orderedCurrs.push(code);
    });

    const activeCodes = rawSearchData.active_currency_codes;
    if (searchState.showZeroBalance && Array.isArray(activeCodes) && activeCodes.length > 0) {
      const activeSet = new Set(activeCodes.map((c) => String(c || "").toUpperCase()));
      orderedCurrs = orderedCurrs.filter((code) => activeSet.has(String(code || "").toUpperCase()));
    }

    const grouped = orderedCurrs.map((currency) => {
      const { left: gl, right: gr } = groupedMap[currency];
      const l = sortByRole(gl);
      const r = sortByRole(gr);
      const tL = calculateTotals(l);
      const tR = calculateTotals(r);
      const tS = mergeTotals(tL, tR);
      return { currency, left: l, right: r, totalsLeft: tL, totalsRight: tR, totalsSummary: tS };
    });

    return {
      mode: "grouped",
      defaultLeft: [],
      defaultRight: [],
      totalsLeft,
      totalsRight,
      totalsSummary,
      grouped,
      singleCurrencyTitle: null,
    };
  }, [rawSearchData, searchState, txType, showAllCurrencies, selectedCurrencies, currencyRowsOrdered]);

  const effectiveDateFromEarly = dateFrom || todayDmy;
  const effectiveDateToEarly = dateTo || todayDmy;

  const saveTxListToSession = useCallback(
    (data) => {
      try {
        const key = buildTxListSessionKey({
          companyId: filterSnapshot?.companyId,
          dateFrom: effectiveDateFromEarly,
          dateTo: effectiveDateToEarly,
          selectedCategories,
          showInactive: searchState.showPaymentOnly,
          showCaptureOnly: searchState.showCaptureOnly,
          hideZeroBalance: !searchState.showZeroBalance,
          showAllCurrencies,
          selectedCurrencies,
        });
        if (!key || !data) return;
        const ts = Date.now();
        const wrap = JSON.stringify({ v: 2, savedAt: ts, data });
        if (wrap.length > 1800000) return;
        sessionStorage.setItem(key, wrap);
        lastSearchCommitMsRef.current = ts;
      } catch {
        /* quota */
      }
    },
    [
      filterSnapshot?.companyId,
      effectiveDateFromEarly,
      effectiveDateToEarly,
      selectedCategories,
      searchState.showPaymentOnly,
      searchState.showCaptureOnly,
      searchState.showZeroBalance,
      showAllCurrencies,
      selectedCurrencies,
    ],
  );

  const runSearch = async ({ silent = false, isInitialLoad = false } = {}) => {
    const cid = filterSnapshot?.companyId;
    if (!cid) return;
    if (!effectiveDateFromEarly || !effectiveDateToEarly) {
      pushToast("Please select date range", "error");
      return;
    }
    if (!showAllCurrencies && selectedCurrencies.length === 0) {
      setTablesVisible(false);
      pushToast("Please select at least one Currency or select All", "info");
      return;
    }

    const categoryParam =
      selectedCategories.length > 0 && !selectedCategories.includes("")
        ? [...selectedCategories].sort().join(",")
        : "";
    const singleSelectedCurrency =
      !showAllCurrencies && selectedCurrencies.length === 1 ? String(selectedCurrencies[0] || "").toUpperCase() : "";

    const requestKey = JSON.stringify({
      dateFrom: effectiveDateFromEarly,
      dateTo: effectiveDateToEarly,
      categoryParam,
      showInactive: searchState.showPaymentOnly ? "1" : "0",
      showCaptureOnly: searchState.showCaptureOnly ? "1" : "0",
      hideZero: searchState.showZeroBalance ? "0" : "1",
      companyId: cid || "",
      showAllCurrencies: !!showAllCurrencies,
      currencies: [...selectedCurrencies].sort().join(","),
    });

    if (!silent && !isInitialLoad && lastCompletedSearchKeyRef.current === requestKey && Date.now() - lastCompletedSearchTsRef.current < 1200) {
      return;
    }

    if (searchAbortRef.current) {
      try {
        searchAbortRef.current.abort();
      } catch {
        /* ignore */
      }
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const { signal } = controller;

    if (!silent) setSearchLoading(true);
    setTablesVisible(true);

    const paramsBase = {
      companyId: cid,
      dateFrom: effectiveDateFromEarly,
      dateTo: effectiveDateToEarly,
      showInactive: searchState.showPaymentOnly,
      showCaptureOnly: searchState.showCaptureOnly,
      hideZeroBalance: !searchState.showZeroBalance,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      currencyCodes: !showAllCurrencies && selectedCurrencies.length > 0 ? selectedCurrencies : undefined,
      signal,
    };

    const commitQuiet = (data) => {
      setRawSearchData(data);
      saveTxListToSession(data);
      lastCompletedSearchKeyRef.current = requestKey;
      lastCompletedSearchTsRef.current = Date.now();
      const totalAccounts = (data.left_table?.length || 0) + (data.right_table?.length || 0);
      const displayed = countDisplayedRows(data, searchState, txType);
      if (!silent) {
        if (totalAccounts === 0) {
          pushToast(
            "Search completed but no data found. Please check date range, Currency filter, or confirm data has been submitted",
            "info",
          );
        } else if (displayed === 0 && totalAccounts > 0) {
          pushToast(
            `Search returned ${totalAccounts} row(s), but none match current display filters (e.g. zero balance hidden when "Show 0 balance" is off, or "Show Payment Only" / "Show Win/Loss Only"). Enable "Show 0 balance" or adjust filters.`,
            "info",
          );
        } else {
          pushToast(`Search completed, found ${displayed} record(s)`, "success");
        }
      }
    };

    try {
      const result = await searchTransactionsApi(paramsBase);
      if (!result?.success || !result?.data) {
        if (!silent) {
          setRawSearchData(null);
          pushToast(result?.message || result?.error || "Search failed", "error");
        }
        return;
      }

      let currentData = result.data;
      const leftRows = Array.isArray(currentData.left_table) ? currentData.left_table : [];
      const rightRows = Array.isArray(currentData.right_table) ? currentData.right_table : [];
      const totalAccounts = leftRows.length + rightRows.length;

      if (singleSelectedCurrency && totalAccounts === 0) {
        const fallback = await searchTransactionsApi({
          ...paramsBase,
          currencyCodes: undefined,
        });
        if (fallback?.success && fallback?.data) {
          const fbLeft = (fallback.data.left_table || []).filter(
            (row) => String(row?.currency || "").toUpperCase() === singleSelectedCurrency,
          );
          const fbRight = (fallback.data.right_table || []).filter(
            (row) => String(row?.currency || "").toUpperCase() === singleSelectedCurrency,
          );
          currentData = {
            ...fallback.data,
            left_table: fbLeft,
            right_table: fbRight,
            totals: {
              left: calculateTotals(fbLeft),
              right: calculateTotals(fbRight),
              summary: mergeTotals(calculateTotals(fbLeft), calculateTotals(fbRight)),
            },
          };
        }
      } else if (searchState.showCaptureOnly && totalAccounts === 0) {
        const fallback = await searchTransactionsApi({
          ...paramsBase,
          showCaptureOnly: false,
        });
        if (fallback?.success && fallback?.data?.totals) {
          currentData = {
            ...currentData,
            totals: fallback.data.totals,
          };
        }
      }

      commitQuiet(currentData);
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error(e);
      if (!silent) pushToast(`Search failed: ${e.message}`, "error");
    } finally {
      if (!silent) setSearchLoading(false);
    }
  };

  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;

  const onSearch = () => runSearch({ silent: false });

  /** Hidden #date_from/#date_to must stay in sync for MaintenanceDateRangePicker (writes DOM directly). */
  useEffect(() => {
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const f = dateFrom || todayDmy;
    const t = dateTo || todayDmy;
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
  }, [dateFrom, dateTo, todayDmy]);

  /** Legacy initDatePickers: shared Capture Date range + Flatpickr on transaction / rate dates */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    let cancelled = false;
    (async () => {
      try {
        await loadTxScriptOnce(assetUrl("js/date-range-picker.js"), "tx-dr");
        await injectStylesheet("https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css");
        await loadTxScriptOnce("https://cdn.jsdelivr.net/npm/flatpickr", "tx-fp");
      } catch (e) {
        console.error(e);
        return;
      }
      if (cancelled) return;

      const df = document.getElementById("date_from");
      const dto = document.getElementById("date_to");
      const ef = dateFrom || todayDmy;
      const et = dateTo || todayDmy;
      if (df) df.value = ef;
      if (dto) dto.value = et;

      if (window.MaintenanceDateRangePicker?.init && !txDateRangePickerReadyRef.current) {
        window.MaintenanceDateRangePicker.init({
          onChange: () => {
            const from = window.MaintenanceDateRangePicker.getDateFrom?.() || "";
            const to = window.MaintenanceDateRangePicker.getDateTo?.() || "";
            setDateFrom(from);
            setDateTo(to);
            queueMicrotask(() => runSearchRef.current?.({ silent: false }));
          },
        });
        txDateRangePickerReadyRef.current = true;
      }

      const txInput = document.getElementById("transaction_date");
      const rateInput = document.getElementById("rate_transaction_date");
      if (window.flatpickr && txInput && !fpTxDateRef.current) {
        fpTxDateRef.current = window.flatpickr(txInput, {
          dateFormat: "d/m/Y",
          allowInput: false,
          defaultDate: parseDmyToDate(txDate || todayDmy) || new Date(),
          onChange: (_d, dateStr) => {
            if (dateStr) setTxDate(dateStr);
          },
        });
      }
      if (window.flatpickr && rateInput && !fpRateDateRef.current) {
        fpRateDateRef.current = window.flatpickr(rateInput, {
          dateFormat: "d/m/Y",
          allowInput: false,
          defaultDate: parseDmyToDate(rateDate || todayDmy) || new Date(),
          onChange: (_d, dateStr) => {
            if (dateStr) setRateDate(dateStr);
          },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, filterSnapshot]);

  useEffect(() => {
    const fp = fpTxDateRef.current;
    if (!fp?.setDate) return;
    const d = parseDmyToDate(txDate || todayDmy);
    if (d) fp.setDate(d, false);
  }, [txDate, todayDmy]);

  useEffect(() => {
    const fp = fpRateDateRef.current;
    if (!fp?.setDate) return;
    const d = parseDmyToDate(rateDate || todayDmy);
    if (d) fp.setDate(d, false);
  }, [rateDate, todayDmy]);

  useEffect(() => {
    if (!quickOpen) return;
    const close = (e) => {
      if (e.target.closest?.(".quick-select-dropdown-toggle")) return;
      setQuickOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [quickOpen]);

  useEffect(() => {
    if (!categoryOpen) return;
    const close = (e) => {
      if (e.target.closest?.(".category-dropdown")) return;
      setCategoryOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [categoryOpen]);

  useEffect(() => {
    if (!categoryChangedByUserRef.current) return;
    categoryChangedByUserRef.current = false;
    if (loading || forbidden || !filterSnapshot?.companyId) return;
    if (!effectiveDateFromEarly || !effectiveDateToEarly) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;
    void runSearchRef.current?.({ silent: false });
  }, [
    selectedCategories,
    loading,
    forbidden,
    filterSnapshot?.companyId,
    effectiveDateFromEarly,
    effectiveDateToEarly,
    showAllCurrencies,
    selectedCurrencies,
  ]);

  useEffect(() => {
    if (!canApproveContra || !contraInbox.open) return;
    const onDoc = (e) => {
      const wrap = document.getElementById("contraInboxWrap");
      if (!wrap || wrap.contains(e.target)) return;
      setContraInbox((s) => ({ ...s, open: false }));
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [canApproveContra, contraInbox.open]);

  useEffect(() => {
    initialSearchDoneRef.current = false;
  }, [filterSnapshot?.companyId]);

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot?.companyId) return;
    if (currencyRowsOrdered.length === 0) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;
    if (initialSearchDoneRef.current) return;

    let hadReplay = false;
    try {
      const key = buildTxListSessionKey({
        companyId: filterSnapshot?.companyId,
        dateFrom: effectiveDateFromEarly,
        dateTo: effectiveDateToEarly,
        selectedCategories,
        showInactive: searchState.showPaymentOnly,
        showCaptureOnly: searchState.showCaptureOnly,
        hideZeroBalance: !searchState.showZeroBalance,
        showAllCurrencies,
        selectedCurrencies,
      });
      if (key) {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const o = JSON.parse(raw);
          if (o?.data && (o.v === 1 || o.v === 2)) {
            const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
            const savedAt = o.v === 2 && typeof o.savedAt === "number" ? o.savedAt : 0;
            if (invalidateTs <= savedAt) {
              setRawSearchData(o.data);
              setTablesVisible(true);
              lastSearchCommitMsRef.current = savedAt || Date.now();
              hadReplay = true;
            } else {
              try {
                sessionStorage.removeItem(key);
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
    } catch {
      /* ignore */
    }

    initialSearchDoneRef.current = true;
    void runSearchRef.current?.({ isInitialLoad: true, silent: hadReplay });
  }, [
    loading,
    forbidden,
    filterSnapshot?.companyId,
    currencyRowsOrdered.length,
    showAllCurrencies,
    selectedCurrencies,
    effectiveDateFromEarly,
    effectiveDateToEarly,
    selectedCategories,
    searchState.showPaymentOnly,
    searchState.showCaptureOnly,
    searchState.showZeroBalance,
  ]);

  const skipFilterSearchEffectRef = useRef(true);
  useEffect(() => {
    if (skipFilterSearchEffectRef.current) {
      skipFilterSearchEffectRef.current = false;
      return;
    }
    if (loading || forbidden || !filterSnapshot?.companyId) return;
    if (!effectiveDateFromEarly || !effectiveDateToEarly) return;
    void runSearchRef.current?.({ silent: false });
  }, [searchState.showCaptureOnly, searchState.showPaymentOnly, searchState.showZeroBalance]);

  useEffect(() => {
    return installTransactionExcelCopy();
  }, []);

  useEffect(() => {
    let retryTimer = null;
    const queueRetry = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        refreshFromInvalidate();
      }, 650);
    };

    const refreshFromInvalidate = () => {
      const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
      if (!invalidateTs || invalidateTs <= lastSearchCommitMsRef.current) return;
      if (!effectiveDateFromEarly || !effectiveDateToEarly) {
        queueRetry();
        return;
      }
      if (!showAllCurrencies && selectedCurrencies.length === 0) {
        queueRetry();
        return;
      }
      setHistory((h) => (h.open ? { ...h, open: false } : h));
      try {
        const key = buildTxListSessionKey({
          companyId: filterSnapshot?.companyId,
          dateFrom: effectiveDateFromEarly,
          dateTo: effectiveDateToEarly,
          selectedCategories,
          showInactive: searchState.showPaymentOnly,
          showCaptureOnly: searchState.showCaptureOnly,
          hideZeroBalance: !searchState.showZeroBalance,
          showAllCurrencies,
          selectedCurrencies,
        });
        if (key) sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      void runSearchRef.current?.({ silent: true });
    };

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    };
    const onStorage = (e) => {
      if (!e || e.key !== TX_LIST_INVALIDATE_LS_KEY) return;
      refreshFromInvalidate();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    window.addEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    }, 5000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
      clearInterval(poll);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    filterSnapshot?.companyId,
    effectiveDateFromEarly,
    effectiveDateToEarly,
    selectedCategories,
    searchState.showPaymentOnly,
    searchState.showCaptureOnly,
    searchState.showZeroBalance,
    showAllCurrencies,
    selectedCurrencies,
  ]);

  useEffect(() => {
    const prev = prevTxTypeRef.current;
    if (prev === txType) return;
    const wasRate = prev === "RATE";
    const isRate = txType === "RATE";
    prevTxTypeRef.current = txType;
    if (isRate && !wasRate) setRateDate((d) => d || txDate || todayDmy);
    else if (!isRate && wasRate) setTxDate((d) => d || rateDate || todayDmy);
  }, [txType, txDate, rateDate, todayDmy]);

  useEffect(() => {
    const needsFrom = ["CONTRA", "PAYMENT", "RECEIVE", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
    if (!needsFrom) setTxFromAccount(null);
  }, [txType]);

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot?.companyId) return;
    if (!canApproveContra) return;
    let cancelled = false;
    loadContraInbox({ companyId: filterSnapshot.companyId }).then((r) => {
      if (cancelled) return;
      const items = Array.isArray(r?.data) ? r.data : [];
      setContraInbox((s) => ({ ...s, items }));
    });
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, filterSnapshot?.companyId, canApproveContra]);

  const removeCategoryTag = useCallback((categoryValue) => {
    const v = String(categoryValue || "").toUpperCase().trim();
    setSelectedCategories((prev) => prev.filter((x) => String(x).toUpperCase() !== v));
    queueMicrotask(() => runSearchRef.current?.({ silent: false }));
  }, []);

  useLayoutEffect(() => {
    const el = categoryAllCheckboxRef.current;
    if (!el) return;
    const n = categories.length;
    const k = selectedCategories.length;
    el.indeterminate = n > 0 && k > 0 && k < n;
  }, [categories.length, selectedCategories]);

  if (forbidden) {
    return <Navigate to="/dashboard" replace />;
  }
  if (loading || !filterSnapshot) {
    return null;
  }

  const fs = filterSnapshot;
  const effectiveDateFrom = dateFrom || todayDmy;
  const effectiveDateTo = dateTo || todayDmy;
  const effectiveDateRangeText = `${effectiveDateFrom} - ${effectiveDateTo}`;
  const histMoney = (v) => (v === "-" ? "-" : formatPaymentHistoryMoney(v));

  const selectQuickRange = (key) => {
    setQuickOpen(false);
    if (typeof window.selectQuickRange === "function") {
      window.selectQuickRange(key);
      return;
    }

    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    const setWeekStart = (d) => {
      const day = d.getDay(); // 0 Sun
      const diff = day; // Sunday start
      d.setDate(d.getDate() - diff);
    };

    const setWeekEnd = (d) => {
      const day = d.getDay();
      const diff = 6 - day;
      d.setDate(d.getDate() + diff);
    };

    switch (key) {
      case "today":
        break;
      case "yesterday":
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case "thisWeek":
        setWeekStart(start);
        setWeekEnd(end);
        break;
      case "lastWeek": {
        setWeekStart(start);
        setWeekEnd(end);
        start.setDate(start.getDate() - 7);
        end.setDate(end.getDate() - 7);
        break;
      }
      case "thisMonth":
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
        break;
      case "lastMonth":
        start.setMonth(start.getMonth() - 1, 1);
        end.setMonth(end.getMonth(), 0);
        break;
      case "thisYear":
        start.setMonth(0, 1);
        end.setMonth(11, 31);
        break;
      case "lastYear":
        start.setFullYear(start.getFullYear() - 1, 0, 1);
        end.setFullYear(end.getFullYear() - 1, 11, 31);
        break;
      default:
        break;
    }

    setDateFrom(formatDmy(start));
    setDateTo(formatDmy(end));
  };

  const toggleCategory = () => setCategoryOpen((v) => !v);
  const toggleQuick = () => setQuickOpen((v) => !v);
  const onCategoryAllChange = (checked) => {
    if (!checked) return;
    categoryChangedByUserRef.current = true;
    setSelectedCategories([]);
  };

  const toggleCategoryValue = (value) => {
    const v = String(value || "").toUpperCase().trim();
    categoryChangedByUserRef.current = true;
    setSelectedCategories((prev) => {
      const set = new Set(prev.map((x) => String(x).toUpperCase()));
      if (set.has(v)) set.delete(v);
      else set.add(v);
      return [...set];
    });
  };

  const effectiveType = txType === "PROFIT" ? winLoseSide : txType;
  /** 与 legacy handleTypeToggle：needsFrom 使用 transaction_type 原始值（含 PROFIT），勿用 WIN/LOSE。 */
  const needsFromTo = ["CONTRA", "PAYMENT", "RECEIVE", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
  const showStandardFromAndReverse = txType !== "RATE" && needsFromTo;
  const isAdjustment = txType === "ADJUSTMENT";

  const onReverseAccounts = () => {
    setTxToAccount(txFromAccount);
    setTxFromAccount(txToAccount);
  };

  const onSubmitTx = async () => {
    if (!txConfirm) return;
    if (submitting) return;

    const companyId = fs?.companyId;
    if (!companyId) return;

    if (!txType) {
      pushToast("Please select transaction type", "error");
      return;
    }

    const toId = txToAccount?.id ? String(txToAccount.id) : "";
    const fromId = txFromAccount?.id ? String(txFromAccount.id) : "";

    if (!toId) {
      pushToast("Please select To Account", "error");
      return;
    }

    if (txType === "PROFIT") {
      if (!fromId) {
        pushToast("PROFIT: Please select From Account", "error");
        return;
      }
      if (toId && fromId && toId === fromId) {
        pushToast("PROFIT: Select To Account and Select From Account cannot be the same", "error");
        return;
      }
    }

    if (needsFromTo && (!fromId || fromId === toId)) {
      pushToast("PAYMENT/RECEIVE/CONTRA/CLAIM/CLEAR transaction requires From Account", "error");
      return;
    }

    if (!txDate) {
      pushToast("Please select transaction date", "error");
      return;
    }

    if (txType === "RATE") {
      const toId = rateToAccount?.id ? String(rateToAccount.id) : "";
      const fromId = rateFromAccount?.id ? String(rateFromAccount.id) : "";
      if (!toId) {
        pushToast("Please select To Account", "error");
        return;
      }
      if (!fromId) {
        pushToast("Rate transaction requires From Account", "error");
        return;
      }
      if (!rateCurrencyFrom || !rateCurrencyTo) {
        pushToast("Please select both currencies", "error");
        return;
      }
      const fromAmt = toNumberLike(rateCurrencyFromAmount);
      const toAmt = toNumberLike(rateCurrencyToAmount);
      if (!Number.isFinite(fromAmt) || fromAmt <= 0 || !Number.isFinite(toAmt) || toAmt <= 0) {
        pushToast("Please enter valid currency amounts", "error");
        return;
      }
      const parsedRate = parseRateExpression(rateExchangeRateRaw);
      if (!parsedRate.valid) {
        pushToast("Please enter a valid rate value (supports * and /)", "error");
        return;
      }
      if (!rateDate) {
        pushToast("Please select transaction date", "error");
        return;
      }

      const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";

      if ((middleId || rateMiddlemanRate) && !middleId) {
        pushToast("Please select Middle-Man account", "error");
        return;
      }
      if ((middleId || rateMiddlemanRate) && (!rateMiddlemanRate || Number(rateMiddlemanRate) <= 0)) {
        pushToast("Please enter Middle-Man rate multiplier", "error");
        return;
      }

      setSubmitting(true);
      try {
        const clientRequestId = buildClientRequestId();
        const { payload } = buildRatePayload({
          toId,
          fromId,
          fromAmt,
          toAmt,
          rateDate,
          txRemark,
          rateCurrencyFrom,
          rateCurrencyTo,
          parsedRateValue: parsedRate.value,
          rateMiddlemanRate,
          rateMiddlemanAmount,
          rateMiddlemanAccount,
          rateExchangeRateRaw,
          rateFromAccount,
          rateToAccount,
          rateTransferToAccount,
          rateTransferFromAccount,
        });

        const res = await submitTransaction({ companyId, payload, clientRequestId });
        if (res?.success) {
          const approvalStatus = res?.data?.approval_status ? String(res.data.approval_status).toUpperCase() : "";
          if (approvalStatus === "PENDING") {
            pushToast("Submitted. Waiting for Manager+ approval to take effect.", "info");
          } else {
            pushToast(res?.message || "RATE transaction submitted successfully", "success");
          }
          await refreshContraInboxBadge();
          setTxConfirm(false);
          setRateCurrencyFromAmount("");
          setRateExchangeRateRaw("");
          setRateCurrencyToAmount("");
          setRateMiddlemanRate("");
          setRateMiddlemanAmount("");
          setRateToAccount(null);
          setRateFromAccount(null);
          setRateTransferToAccount(null);
          setRateTransferFromAccount(null);
          setRateMiddlemanAccount(null);
          await onSearch();
          return;
        }
        pushToast(res?.message || "Submit failed", "error");
      } catch (e) {
        console.error(e);
        pushToast("Network error. Please try again.", "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const amountStr = String(txAmount ?? "").trim();
    const n = Number(amountStr);
    if (!Number.isFinite(n) || amountStr === "") {
      pushToast(isAdjustment ? "Please enter a non-zero adjustment amount" : "Please enter a valid amount (>= 0)", "error");
      return;
    }
    if (!isAdjustment && n < 0) {
      pushToast("Please enter a valid amount (>= 0)", "error");
      return;
    }
    if (isAdjustment && n === 0) {
      pushToast("Please enter a non-zero adjustment amount", "error");
      return;
    }

    if (!txCurrency) {
      pushToast("Please select Currency", "error");
      return;
    }

    setSubmitting(true);
    try {
      const clientRequestId = buildClientRequestId();
      const payload = {
        transaction_type: effectiveType,
        account_id: toId,
        from_account_id: isAdjustment ? "" : fromId || "",
        amount: txAmount,
        transaction_date: txDate,
        description: "",
        sms: txRemark,
        currency: txCurrency,
      };

      const res = await submitTransaction({ companyId, payload, clientRequestId });
      if (res?.success) {
        const approvalStatus = res?.data?.approval_status ? String(res.data.approval_status).toUpperCase() : "";
        if (approvalStatus === "PENDING") {
          pushToast("Submitted. Waiting for Manager+ approval to take effect.", "info");
        } else {
          pushToast(res?.message || "Transaction submitted successfully", "success");
        }
        await refreshContraInboxBadge();
        setTxAmount("");
        setTxConfirm(false);
        await onSearch();
        return;
      }
      pushToast(res?.message || "Submit failed", "error");
    } catch (e) {
      console.error(e);
      pushToast("Network error. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleContraInbox = async () => {
    if (!canApproveContra) return;
    setContraInbox((s) => ({ ...s, open: !s.open }));
    if (contraInbox.items.length > 0) return;
    setContraInbox((s) => ({ ...s, loading: true }));
    try {
      const refreshed = await loadContraInbox({ companyId: fs.companyId });
      const items = Array.isArray(refreshed?.data) ? refreshed.data : [];
      setContraInbox((s) => ({ ...s, items, loading: false }));
    } catch {
      setContraInbox((s) => ({ ...s, loading: false }));
      pushToast("Failed to load contra inbox", "error");
    }
  };

  const refreshContraInbox = async () => {
    if (!canApproveContra) return;
    setContraInbox((s) => ({ ...s, loading: true }));
    try {
      const refreshed = await loadContraInbox({ companyId: fs.companyId });
      const items = Array.isArray(refreshed?.data) ? refreshed.data : [];
      setContraInbox((s) => ({ ...s, items, loading: false }));
    } catch {
      setContraInbox((s) => ({ ...s, loading: false }));
      pushToast("Failed to load contra inbox", "error");
    }
  };

  const refreshContraInboxBadge = async () => {
    if (!canApproveContra || !fs?.companyId) return;
    try {
      const refreshed = await loadContraInbox({ companyId: fs.companyId });
      const items = Array.isArray(refreshed?.data) ? refreshed.data : [];
      setContraInbox((s) => ({ ...s, items }));
    } catch {
      /* ignore */
    }
  };

  const openHistory = async (row) => {
    let aid = parseInt(String(row?.account_db_id ?? ""), 10);
    if (Number.isNaN(aid)) aid = 0;
    const virtualCompanyCode = String(row?.account_id || "")
      .trim()
      .toUpperCase();
    const isVirtualCompanyRow = (!aid || aid <= 0) && virtualCompanyCode !== "";

    if ((!aid || aid <= 0) && !isVirtualCompanyRow) {
      pushToast("Invalid account for history", "error");
      return;
    }
    if (!effectiveDateFrom || !effectiveDateTo) {
      pushToast("Please search first to set date range", "error");
      return;
    }

    let currencyParam = row.currency ? String(row.currency).trim() : "";
    if (!currencyParam && selectedCurrencies.length > 0 && !showAllCurrencies) {
      currencyParam = selectedCurrencies.join(",");
    }

    setHistory({ open: true, title: "Payment History", rows: [], loading: true });
    try {
      const data = await getHistory({
        companyId: fs.companyId,
        accountId: isVirtualCompanyRow ? aid || 0 : aid,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        currency: currencyParam || undefined,
        virtualCompanyCode: isVirtualCompanyRow ? virtualCompanyCode : undefined,
      });
      if (!data?.success) {
        pushToast(data?.error || data?.message || "Failed to load history", "error");
        setHistory({ open: false, title: "", rows: [], loading: false });
        return;
      }
      const payload = data.data;
      const hist = Array.isArray(payload?.history) ? payload.history : [];
      const acc = payload?.account;
      const titleCode = acc?.account_id ?? row.account_id ?? "";
      const titleName = acc?.name ?? row.account_name ?? "";
      const title = `Payment History - ${titleCode}${titleName ? ` (${toUpperDisplay(titleName)})` : ""}`;
      setHistory({ open: true, title, rows: hist, loading: false });
    } catch (e) {
      console.error(e);
      pushToast("Failed to load history", "error");
      setHistory({ open: false, title: "", rows: [], loading: false });
    }
  };

  const findAccountOption = (accountDbId, accountCode) => {
    const list = accountOptions || [];
    return (
      list.find((a) => String(a.id) === String(accountDbId)) ||
      list.find((a) => String(a.account_id) === String(accountCode)) ||
      null
    );
  };

  const handleBalanceCellClick = (row, isLeftTable) => {
    const accountCode = row?.account_id || "";
    const balance = row?.balance;
    const rowCurrency = row?.currency ? String(row.currency).trim().toUpperCase() : "";
    const parsedBalanceForSide = parseBalanceValue(balance);

    const isRateView = txType === "RATE";
    const isProfitType = txType === "PROFIT";
    const treatAsPositiveRow = isRateView
      ? isLeftTable
      : isProfitType
        ? parsedBalanceForSide === null
          ? isLeftTable
          : (parsedBalanceForSide ?? 0) >= 0
        : isLeftTable;

    const opt = findAccountOption(row?.account_db_id, accountCode);
    const syncCurrency = rowCurrency || (opt?.currency ? String(opt.currency).trim().toUpperCase() : "");

    if (isRateView) {
      if (treatAsPositiveRow) {
        if (opt) setRateToAccount(opt);
        if (opt) setRateTransferFromAccount(opt);
      } else {
        if (opt) setRateFromAccount(opt);
        if (opt) setRateTransferToAccount(opt);
      }
      const numericBalance = parseBalanceValue(balance);
      if (numericBalance !== null) {
        const absBal = Math.abs(numericBalance);
        const absFmt = formatRateAmount(absBal);
        const negFmt = formatRateAmount(-absBal);
        // Legacy: left → rate_currency_to_amount only; right → rate_currency_from_amount (negative) only.
        if (treatAsPositiveRow) {
          setRateCurrencyToAmount(absFmt);
        } else {
          setRateCurrencyFromAmount(negFmt);
        }
      }
      if (syncCurrency) setRateCurrencyFrom(syncCurrency);
      pushToast("Synced fields from balance cell", "success");
      return;
    }

    if (treatAsPositiveRow) {
      if (opt) setTxToAccount(opt);
    } else if (opt) {
      setTxFromAccount(opt);
    }
    const numericBalance = parseBalanceValue(balance);
    if (numericBalance !== null) {
      setTxAmount(formatRateAmount(Math.abs(numericBalance)));
    }
    if (syncCurrency) setTxCurrency(syncCurrency);
    pushToast(`Synced ${treatAsPositiveRow ? "To" : "From"} Account: ${accountCode}`, "success");
  };

  const switchCompanySession = async (companyIdStr /* , _companyCode */) => {
    const raw = companyIdStr != null ? String(companyIdStr).trim() : "";
    if (!raw || raw === "null") {
      setRawSearchData(null);
      setTablesVisible(false);
      setSelectedCurrencies([]);
      setShowAllCurrencies(false);
      setCurrencyRowsOrdered([]);
      setFilterSnapshot((prev) => (prev ? { ...prev, companyId: null } : prev));
      currencyInitCompanyRef.current = null;
      initialSearchDoneRef.current = false;
      return;
    }
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${raw}`), {
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        pushToast(j.message || "Unable to switch company", "error");
        return;
      }
      notifyCompanySessionUpdated();
    } catch (e) {
      console.error(e);
      pushToast("Unable to switch company", "error");
      return;
    }
    setFilterSnapshot((prev) => (prev ? { ...prev, companyId: Number(raw) } : prev));
    currencyInitCompanyRef.current = null;
    initialSearchDoneRef.current = false;
    navigate(`/transaction?company_id=${encodeURIComponent(raw)}`, { replace: true });
  };

  const onGroupButtonClick = (gid) => {
    if (fs.selectedGroup === gid) {
      sessionStorage.removeItem("dashboard_group_filter");
      setFilterSnapshot((prev) => (prev ? { ...prev, selectedGroup: null } : prev));
      void switchCompanySession(null);
      return;
    }
    sessionStorage.setItem("dashboard_group_filter", gid);
    const inGroup = fs.snapCompanies.filter(
      (c) => c.group_id != null && String(c.group_id).toUpperCase().trim() === String(gid).toUpperCase(),
    );
    const first = inGroup[0];
    setFilterSnapshot((prev) => (prev ? { ...prev, selectedGroup: gid } : prev));
    if (first) void switchCompanySession(String(first.id));
  };

  const onCompanyButtonClick = (comp) => {
    void switchCompanySession(String(comp.id));
  };

  const toggleAllCurrenciesBtn = () => {
    const next = !showAllCurrencies;
    setShowAllCurrencies(next);
    if (next) {
      setSelectedCurrencies([]);
      persistCurrencyFilter(fs.companyId, true, []);
    } else {
      persistCurrencyFilter(fs.companyId, false, selectedCurrencies);
    }
    queueMicrotask(() => runSearchRef.current?.({ silent: false }));
  };

  const toggleCurrencyBtn = (code) => {
    let na = showAllCurrencies;
    if (na) na = false;
    setShowAllCurrencies(na);
    setSelectedCurrencies((prev) => {
      const i = prev.indexOf(code);
      const next = [...prev];
      if (i >= 0) next.splice(i, 1);
      else next.push(code);
      persistCurrencyFilter(fs.companyId, na, next);
      return next;
    });
    queueMicrotask(() => runSearchRef.current?.({ silent: false }));
  };

  const onCurrencyDragStart = (code) => {
    draggedCurrencyRef.current = code;
  };

  const onCurrencyDropOn = (targetCode) => {
    const drag = draggedCurrencyRef.current;
    draggedCurrencyRef.current = null;
    if (!drag || drag === "ALL" || targetCode === "ALL" || drag === targetCode) return;
    setCurrencyRowsOrdered((prev) => {
      const codes = prev.map((x) => x.code);
      const fromIdx = codes.indexOf(drag);
      const toIdx = codes.indexOf(targetCode);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const order = next.map((x) => x.code);
      try {
        localStorage.setItem(`transaction_currency_order_${fs.companyId || 0}`, JSON.stringify(order));
        localStorage.setItem("transaction_currency_order_global", JSON.stringify(order));
        localStorage.setItem(`transaction_default_currency_${fs.companyId || 0}`, String(order[0] || "").toUpperCase());
      } catch {
        /* ignore */
      }
      void saveUserCurrencyOrder(order);
      return next;
    });
  };

  const tp = tablePresentation;
  const fallbackRoleClass = selectedCategories.length === 1 ? getRoleClass(selectedCategories[0]) : "";

  return (
    <>
      <div className="transaction-container">
        <TransactionHeader
          canApproveContra={canApproveContra}
          contraInbox={contraInbox}
          toggleContraInbox={toggleContraInbox}
          refreshContraInbox={refreshContraInbox}
          approveContra={approveContra}
          rejectContra={rejectContra}
          fsCompanyId={fs.companyId}
          pushToast={pushToast}
          refreshContraInboxAfterAction={refreshContraInbox}
          runSearch={runSearch}
        />

        <div className="transaction-separator-line" />

        <div className="transaction-main-content">
          <TransactionSearchSection
            selectedCategories={selectedCategories}
            categoryOpen={categoryOpen}
            toggleCategory={toggleCategory}
            removeCategoryTag={removeCategoryTag}
            categoryAllCheckboxRef={categoryAllCheckboxRef}
            categories={categories}
            onCategoryAllChange={onCategoryAllChange}
            toggleCategoryValue={toggleCategoryValue}
            effectiveDateRangeText={effectiveDateRangeText}
            quickOpen={quickOpen}
            toggleQuick={toggleQuick}
            selectQuickRange={selectQuickRange}
            searchState={searchState}
            setSearchState={setSearchState}
            fs={fs}
            onGroupButtonClick={onGroupButtonClick}
            onCompanyButtonClick={onCompanyButtonClick}
            currencyRowsOrdered={currencyRowsOrdered}
            showAllCurrencies={showAllCurrencies}
            selectedCurrencies={selectedCurrencies}
            toggleAllCurrenciesBtn={toggleAllCurrenciesBtn}
            onCurrencyDragStart={onCurrencyDragStart}
            onCurrencyDropOn={onCurrencyDropOn}
            toggleCurrencyBtn={toggleCurrencyBtn}
          />

          <TransactionAddSection
            txType={txType}
            setTxType={setTxType}
            txDate={txDate}
            todayDmy={todayDmy}
            setTxDate={setTxDate}
            accountOptions={accountOptions}
            txToAccount={txToAccount}
            setTxToAccount={setTxToAccount}
            selectedCategories={selectedCategories}
            showStandardFromAndReverse={showStandardFromAndReverse}
            txFromAccount={txFromAccount}
            setTxFromAccount={setTxFromAccount}
            onReverseAccounts={onReverseAccounts}
            txCurrency={txCurrency}
            setTxCurrency={setTxCurrency}
            currencyOptions={currencyOptions}
            txAmount={txAmount}
            setTxAmount={setTxAmount}
            rateDate={rateDate}
            rateToAccount={rateToAccount}
            setRateToAccount={setRateToAccount}
            rateFromAccount={rateFromAccount}
            setRateFromAccount={setRateFromAccount}
            rateCurrencyFrom={rateCurrencyFrom}
            setRateCurrencyFrom={setRateCurrencyFrom}
            rateCurrencyFromAmount={rateCurrencyFromAmount}
            setRateCurrencyFromAmount={setRateCurrencyFromAmount}
            rateExchangeRateRaw={rateExchangeRateRaw}
            setRateExchangeRateRaw={setRateExchangeRateRaw}
            rateCurrencyTo={rateCurrencyTo}
            setRateCurrencyTo={setRateCurrencyTo}
            rateCurrencyToAmount={rateCurrencyToAmount}
            rateTransferToAccount={rateTransferToAccount}
            setRateTransferToAccount={setRateTransferToAccount}
            rateTransferFromAccount={rateTransferFromAccount}
            setRateTransferFromAccount={setRateTransferFromAccount}
            rateMiddlemanAccount={rateMiddlemanAccount}
            setRateMiddlemanAccount={setRateMiddlemanAccount}
            rateMiddlemanRate={rateMiddlemanRate}
            setRateMiddlemanRate={setRateMiddlemanRate}
            rateMiddlemanAmount={rateMiddlemanAmount}
            winLoseSide={winLoseSide}
            setWinLoseSide={setWinLoseSide}
            txRemark={txRemark}
            setTxRemark={setTxRemark}
            txConfirm={txConfirm}
            setTxConfirm={setTxConfirm}
            submitting={submitting}
            onSubmitTx={onSubmitTx}
            onSearch={onSearch}
            searchLoading={searchLoading}
          />
        </div>

        <TransactionTablesSection
          tablesVisible={tablesVisible}
          searchLoading={searchLoading}
          tp={tp}
          searchState={searchState}
          getRoleClass={getRoleClass}
          fallbackRoleClass={fallbackRoleClass}
          openHistory={openHistory}
          handleBalanceCellClick={handleBalanceCellClick}
        />
      </div>

      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
            <select id="calendar-month-select" defaultValue="0">
              <option value="0">Jan</option>
              <option value="1">Feb</option>
              <option value="2">Mar</option>
              <option value="3">Apr</option>
              <option value="4">May</option>
              <option value="5">Jun</option>
              <option value="6">Jul</option>
              <option value="7">Aug</option>
              <option value="8">Sep</option>
              <option value="9">Oct</option>
              <option value="10">Nov</option>
              <option value="11">Dec</option>
            </select>
            <select id="calendar-year-select" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div>
          <div className="calendar-weekday">Mon</div>
          <div className="calendar-weekday">Tue</div>
          <div className="calendar-weekday">Wed</div>
          <div className="calendar-weekday">Thu</div>
          <div className="calendar-weekday">Fri</div>
          <div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>

      <div id="notificationContainer" className="transaction-notification-container">
        {toast.map((t) => (
          <div key={t.id} className={`transaction-notification transaction-notification-${t.type} show`}>
            {t.message}
          </div>
        ))}
      </div>

      <TransactionHistoryModal
        history={history}
        setHistory={setHistory}
        histMoney={histMoney}
        showDescriptionColumn={TRANSACTION_SHOW_DESCRIPTION_COLUMN}
      />
    </>
  );
}
