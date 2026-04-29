import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";
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
} from "./transaction/transactionApi.js";
import {
  buildClientRequestId,
  formatDmy,
  formatPaymentHistoryMoney,
  formatRateAmount,
  getHistoryRemark,
  parseBalanceValue,
  parseRateExpression,
  toUpperDisplay,
} from "./transaction/transactionFormat.js";
import { installTransactionExcelCopy } from "./transaction/transactionExcelCopy.js";
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
} from "./transaction/transactionPaymentLogic.js";

/** 与 transaction.php / TRANSACTION_PAGE.showDescriptionColumn 一致（PHP 默认为 true）。 */
const TRANSACTION_SHOW_DESCRIPTION_COLUMN = true;

function AccountSelect({
  buttonId,
  dropdownId,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  profitType,
  selectedCategories,
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const searchRef = useRef(null);
  const optionsContainerRef = useRef(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase();
    let rows = Array.isArray(options) ? options : [];
    if (Array.isArray(selectedCategories) && selectedCategories.length > 0) {
      const set = new Set(selectedCategories.map((c) => String(c).toUpperCase()));
      rows = rows.filter((r) => set.has(String(r.role || "").toUpperCase()));
    }
    if (!q) return rows;
    return rows.filter((r) => String(r.display_text || "").toUpperCase().includes(q));
  }, [options, filter, selectedCategories]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const btn = document.getElementById(buttonId);
      const dd = document.getElementById(dropdownId);
      if (!btn || !dd) return;
      if (btn.contains(e.target) || dd.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, buttonId, dropdownId]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
      setHighlightIdx(-1);
    } else {
      setFilter("");
      setHighlightIdx(-1);
    }
  }, [open]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [filter]);

  useEffect(() => {
    setHighlightIdx((hi) => {
      if (hi < 0) return hi;
      return hi >= filtered.length ? -1 : hi;
    });
  }, [filtered.length]);

  useEffect(() => {
    if (!open || highlightIdx < 0 || !optionsContainerRef.current) return;
    const node = optionsContainerRef.current.querySelector(`[data-opt-idx="${highlightIdx}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open, filtered]);

  const displayText = value?.display_text ? value.display_text : placeholder;

  return (
    <div className="custom-select-wrapper">
      <button
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        id={buttonId}
        data-placeholder={placeholder}
        data-value={value?.id ?? ""}
        data-account-id={value?.id ?? ""}
        data-account-code={value?.account_id ?? ""}
        data-currency={value?.currency != null && String(value.currency).trim() !== "" ? String(value.currency).trim().toUpperCase() : ""}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        {displayText}
      </button>
      <div className={`custom-select-dropdown${open ? " show" : ""}`} id={dropdownId}>
        <div className="custom-select-search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search account..."
            autoComplete="off"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (e.key === "Backspace" && !filter) {
                e.preventDefault();
                onChange?.(null);
                return;
              }
              const len = filtered.length;
              if (len === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIdx((hi) => (hi < 0 ? 0 : (hi + 1) % len));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIdx((hi) => (hi <= 0 ? len - 1 : hi - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = highlightIdx >= 0 ? filtered[highlightIdx] : filtered[0];
                if (pick) {
                  onChange(pick);
                  setOpen(false);
                }
              }
            }}
          />
        </div>
        <div className="custom-select-options" ref={optionsContainerRef}>
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No results</div>
          ) : (
            filtered.map((opt, idx) => (
              <div
                key={opt.id}
                data-opt-idx={idx}
                className={`custom-select-option${String(value?.id) === String(opt.id) ? " selected" : ""}${
                  highlightIdx === idx && highlightIdx >= 0 ? " keyboard-focus" : ""
                }`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                {opt.display_text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

/** dd/mm/yyyy → Date (local), same idea as legacy Month maintenance pages */
function parseDmyToDate(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function loadTxScriptOnce(src, marker) {
  const key = marker || src;
  return new Promise((resolve, reject) => {
    const bySrc = document.querySelector(`script[src="${src}"]`);
    if (bySrc) {
      bySrc.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.txScript = key;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function companyButtonStyle(comp, snapGroup) {
  const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
  if (snapGroup) {
    return cGid === snapGroup ? {} : { display: "none" };
  }
  return cGid ? { display: "none" } : {};
}

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

  const toggleCategoryValue = (value) => {
    const v = String(value || "").toUpperCase().trim();
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
      const fromAmt = Number(String(rateCurrencyFromAmount || "").replace(/,/g, "").trim());
      const toAmt = Number(String(rateCurrencyToAmount || "").replace(/,/g, "").trim());
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

      const transferToId = rateTransferToAccount?.id ? String(rateTransferToAccount.id) : "";
      const transferFromId = rateTransferFromAccount?.id ? String(rateTransferFromAccount.id) : "";
      const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";

      let middleAmtNum = Number(String(rateMiddlemanAmount || "").replace(/,/g, "").trim());
      if (!Number.isFinite(middleAmtNum)) middleAmtNum = 0;

      if ((middleId || rateMiddlemanRate) && !middleId) {
        pushToast("Please select Middle-Man account", "error");
        return;
      }
      if ((middleId || rateMiddlemanRate) && (!rateMiddlemanRate || Number(rateMiddlemanRate) <= 0)) {
        pushToast("Please enter Middle-Man rate multiplier", "error");
        return;
      }

      const fromCode = rateFromAccount?.account_id || "";
      const toCode = rateToAccount?.account_id || "";
      const fromDesc = `Transaction to ${toCode} (Rate: ${rateExchangeRateRaw})`;
      const toDesc = `Transaction from ${fromCode} (Rate: ${rateExchangeRateRaw})`;

      const transferFromCode = rateTransferFromAccount?.account_id || "";
      const transferToCode = rateTransferToAccount?.account_id || "";
      const transferFromDesc = `Transaction to ${transferToCode} (Rate: ${rateExchangeRateRaw})`;
      const transferToDesc = `Transaction from ${transferFromCode} (Rate: ${rateExchangeRateRaw})`;

      const middleDesc =
        middleId && middleAmtNum > 0
          ? `Rate charge (x${rateMiddlemanRate}) from ${rateCurrencyFrom} ${formatRateAmount(fromAmt)}`
          : "";

      setSubmitting(true);
      try {
        const clientRequestId = buildClientRequestId();
        const payload = {
          transaction_type: "RATE",
          account_id: toId,
          from_account_id: fromId,
          amount: formatRateAmount(fromAmt),
          transaction_date: rateDate,
          description: "",
          sms: txRemark,
          currency: rateCurrencyFrom,

          rate_from_account_id: fromId,
          rate_from_currency: rateCurrencyFrom,
          rate_from_amount: formatRateAmount(fromAmt),
          rate_from_description: fromDesc,

          rate_to_account_id: toId,
          rate_to_currency: rateCurrencyTo,
          rate_to_amount: formatRateAmount(toAmt),
          rate_to_description: toDesc,

          rate_currency_from: rateCurrencyFrom,
          rate_currency_from_amount: formatRateAmount(fromAmt),
          rate_currency_to: rateCurrencyTo,
          rate_currency_to_amount: formatRateAmount(toAmt),
          rate_exchange_rate: String(parsedRate.value),

          rate_middleman_rate: rateMiddlemanRate,
          rate_middleman_amount: rateMiddlemanAmount ? formatRateAmount(middleAmtNum) : "",
          rate_middleman_account: middleId,

          // backward compatibility (legacy keeps appending these)
          rate_transfer_amount: "",
          rate_account_from_amount: "",
          rate_account_to_amount: "",
        };

        if (transferToId && transferFromId) {
          const originalTransferFromAmount = fromAmt * parsedRate.value;
          payload.rate_transfer_from_account_id = transferToId;
          payload.rate_transfer_from_currency = rateCurrencyTo;
          payload.rate_transfer_from_amount = formatRateAmount(originalTransferFromAmount);
          payload.rate_transfer_from_description = transferFromDesc;

          payload.rate_transfer_to_account_id = transferFromId;
          payload.rate_transfer_to_currency = rateCurrencyTo;
          payload.rate_transfer_to_amount = formatRateAmount(toAmt);
          payload.rate_transfer_to_description = transferToDesc;

          payload.rate_transfer_from_account = transferToId;
          payload.rate_transfer_to_account = transferFromId;

          if (middleId && middleAmtNum > 0) {
            payload.rate_middleman_account_id = middleId;
            payload.rate_middleman_currency = rateCurrencyTo;
            payload.rate_middleman_amount = formatRateAmount(middleAmtNum);
            payload.rate_middleman_description = middleDesc;
          }
        }

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
        <div className="transaction-header-bar">
          <div className="transaction-header-left">
            <h1 className="transaction-title">Transaction List</h1>
            {canApproveContra && (
              <div className="contra-inbox-wrap" id="contraInboxWrap">
                <button type="button" className="contra-inbox-btn contra-inbox-main" id="contraInboxBtn" onClick={toggleContraInbox}>
                  <svg className="contra-inbox-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                  Contra Inbox
                  <span className="contra-inbox-badge" id="contraInboxCount">
                    {contraInbox.items.length}
                  </span>
                </button>
                <div className="contra-inbox-popover" id="contraInboxPopover" style={{ display: contraInbox.open ? "block" : "none" }}>
                  <div className="contra-inbox-popover-header">
                    <div className="contra-inbox-popover-title">
                      Contra Inbox
                      <span className="contra-inbox-badge" id="contraInboxCount2">
                        {contraInbox.items.length}
                      </span>
                    </div>
                    <button type="button" className="contra-inbox-btn" id="contraInboxRefreshBtn" onClick={refreshContraInbox}>
                      Refresh
                    </button>
                  </div>
                  <div className="contra-inbox-popover-body">
                    {contraInbox.loading && <div style={{ padding: 12 }}>Loading...</div>}
                    <table className="contra-inbox-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Currency</th>
                          <th>Amount</th>
                          <th>Submitted By</th>
                          <th>Description</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody id="contraInboxTbody">
                        {contraInbox.items.map((it) => (
                          <tr key={it.id || `${it.transaction_id}-${it.transaction_date}`}>
                            <td>{it.transaction_date || it.date || "-"}</td>
                            <td>
                              {it.from_account_code || "-"}
                              {it.from_account_name ? ` - ${it.from_account_name}` : ""}
                            </td>
                            <td>
                              {it.to_account_code || "-"}
                              {it.to_account_name ? ` - ${it.to_account_name}` : ""}
                            </td>
                            <td>{toUpperDisplay(it.currency || "-")}</td>
                            <td>{formatPaymentHistoryMoney(it.amount)}</td>
                            <td>{toUpperDisplay(it.submitted_by || it.created_by || "-")}</td>
                            <td>{toUpperDisplay(it.description || "-")}</td>
                            <td>
                              <button
                                type="button"
                                className="contra-inbox-btn contra-inbox-approve"
                                onClick={async () => {
                                  const tid = it.transaction_id || it.id;
                                  if (!tid) return;
                                  const res = await approveContra({ transactionId: tid, companyId: fs.companyId });
                                  if (res?.success) {
                                    pushToast("Approved", "success");
                                    await refreshContraInbox();
                                    await runSearch({ silent: false });
                                  } else {
                                    pushToast(res?.message || "Approve failed", "error");
                                  }
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="contra-inbox-btn contra-inbox-reject"
                                onClick={async () => {
                                  if (!confirm("确定要拒绝这条 Contra 交易吗？拒绝后数据将被永久删除。")) return;
                                  const tid = it.transaction_id || it.id;
                                  if (!tid) return;
                                  const res = await rejectContra({ transactionId: tid, companyId: fs.companyId });
                                  if (res?.success) {
                                    pushToast("Rejected", "success");
                                    await refreshContraInbox();
                                  } else {
                                    pushToast(res?.message || "Reject failed", "error");
                                  }
                                }}
                              >
                                Reject
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="transaction-separator-line" />

        <div className="transaction-main-content">
          <div className="transaction-search-section">
            <div className="transaction-form-group">
              <label className="transaction-label">Category</label>
              <div id="filter_category" className="transaction-category-multiselect">
                <div className="category-dropdown">
                  <button type="button" className="category-dropdown-button" id="category_dropdown_button" onClick={toggleCategory}>
                    <div id="category_selected_tags" className="category-selected-tags">
                      {selectedCategories.length === 0 ? (
                        <span className="category-placeholder">--Select All--</span>
                      ) : (
                        selectedCategories.map((c) => (
                          <div key={c} className="category-tag" data-category-value={c}>
                            <span>{c}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="category-tag-remove"
                              data-category-value={c}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeCategoryTag(c);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeCategoryTag(c);
                                }
                              }}
                            >
                              ×
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <i className="fas fa-chevron-down" />
                  </button>
                  <div className="category-dropdown-menu" id="category_dropdown_menu" style={{ display: categoryOpen ? "block" : "none" }}>
                    <div className="category-option">
                      <label className="category-checkbox-label">
                        <input
                          ref={categoryAllCheckboxRef}
                          type="checkbox"
                          value=""
                          className="category-checkbox"
                          id="category_all"
                          checked={
                            selectedCategories.length === 0 ||
                            (categories.length > 0 && selectedCategories.length === categories.length)
                          }
                          onChange={(e) => {
                            if (e.target.checked) setSelectedCategories([]);
                          }}
                        />
                        <span>--Select All--</span>
                      </label>
                    </div>
                    <div id="category_options_container">
                      {categories.map((c) => {
                        return (
                          <div className="category-option" key={c}>
                            <label className="category-checkbox-label">
                              <input
                                type="checkbox"
                                className="category-checkbox"
                                value={c}
                                checked={selectedCategories.length === 0 ? false : selectedCategories.includes(c)}
                                onChange={() => toggleCategoryValue(c)}
                              />
                              <span>{c}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="transaction-date-quick-row">
              <label className="transaction-label transaction-capture-date-label">Capture Date</label>
              <div className="transaction-date-range-group">
                <div className="date-range-picker" id="date-range-picker">
                  <i className="fas fa-calendar-alt" />
                  <span id="date-range-display">{effectiveDateRangeText}</span>
                </div>
                <input type="hidden" id="date_from" readOnly />
                <input type="hidden" id="date_to" readOnly />
              </div>
              <div className="quick-select-dropdown quick-select-dropdown-toggle">
                <button
                  type="button"
                  className="dropdown-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleQuick();
                  }}
                >
                  <i className="fas fa-calendar-alt" />
                  <span id="quick-select-text">Period</span>
                  <i className="fas fa-chevron-down" />
                </button>
                <div className={`dropdown-menu${quickOpen ? " show" : ""}`} id="quick-select-dropdown">
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("today")}>
                    Today
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("yesterday")}>
                    Yesterday
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("thisWeek")}>
                    This Week
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("lastWeek")}>
                    Last Week
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("thisMonth")}>
                    This Month
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("lastMonth")}>
                    Last Month
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("thisYear")}>
                    This Year
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => selectQuickRange("lastYear")}>
                    Last Year
                  </button>
                </div>
              </div>
            </div>

            <div className="transaction-checkboxes">
              <label className="transaction-checkbox-label">
                <input
                  type="checkbox"
                  id="show_name"
                  className="transaction-checkbox"
                  checked={searchState.showName}
                  onChange={(e) => setSearchState((s) => ({ ...s, showName: e.target.checked }))}
                />
                Show Name
              </label>
              <label className="transaction-checkbox-label">
                <input
                  type="checkbox"
                  id="show_capture_only"
                  className="transaction-checkbox"
                  checked={searchState.showCaptureOnly}
                  onChange={(e) => setSearchState((s) => ({ ...s, showCaptureOnly: e.target.checked }))}
                />
                Show Win/Loss Only
              </label>
              <label className="transaction-checkbox-label">
                <input
                  type="checkbox"
                  id="show_inactive"
                  className="transaction-checkbox"
                  checked={searchState.showPaymentOnly}
                  onChange={(e) => setSearchState((s) => ({ ...s, showPaymentOnly: e.target.checked }))}
                />
                Show Payment Only
              </label>
              <label className="transaction-checkbox-label">
                <input
                  type="checkbox"
                  id="show_zero_balance"
                  className="transaction-checkbox"
                  checked={searchState.showZeroBalance}
                  onChange={(e) => setSearchState((s) => ({ ...s, showZeroBalance: e.target.checked }))}
                />
                Show 0 balance
              </label>
            </div>

            <div className="transaction-bottom-filters">
              {fs.snapGroupIds.length > 0 && (
                <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper">
                  <span className="transaction-company-label">GroupID:</span>
                  <div id="group-buttons-container" className="transaction-company-buttons">
                    {fs.snapGroupIds.map((gid) => (
                      <button
                        key={gid}
                        type="button"
                        className={`transaction-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`}
                        data-group-id={gid}
                        onClick={() => onGroupButtonClick(gid)}
                      >
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {fs.snapCompanies.length > 0 && (
                <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper">
                  <span className="transaction-company-label">Company:</span>
                  <div id="company-buttons-container" className="transaction-company-buttons">
                    {fs.snapCompanies.map((comp) => (
                      <button
                        key={comp.id}
                        type="button"
                        style={companyButtonStyle(comp, fs.selectedGroup)}
                        className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`}
                        data-company-id={comp.id}
                        data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                        data-company-code={comp.company_id}
                        onClick={() => {
                          if (companyButtonStyle(comp, fs.selectedGroup).display === "none") return;
                          onCompanyButtonClick(comp);
                        }}
                      >
                        {comp.company_id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                id="currency-buttons-wrapper"
                className="transaction-company-filter"
                style={{ display: currencyRowsOrdered.length > 0 ? "flex" : "none" }}
              >
                <span className="transaction-company-label">Currency:</span>
                <div id="currency-buttons-container" className="transaction-company-buttons">
                  <button
                    type="button"
                    className={`transaction-company-btn${showAllCurrencies ? " active" : ""}`}
                    data-currency-code="ALL"
                    onClick={toggleAllCurrenciesBtn}
                  >
                    All
                  </button>
                  {currencyRowsOrdered.map((c) => {
                    const code = c.code;
                    return (
                      <button
                        key={code}
                        type="button"
                        className={`transaction-company-btn${!showAllCurrencies && selectedCurrencies.includes(code) ? " active" : ""}`}
                        data-currency-code={code}
                        draggable
                        onDragStart={() => onCurrencyDragStart(code)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onCurrencyDropOn(code)}
                        onClick={() => toggleCurrencyBtn(code)}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="transaction-add-section">
            <div className="transaction-form-group">
              <label className="transaction-label">Type</label>
              <select
                id="transaction_type"
                className="transaction-select"
                value={txType}
                onChange={(e) => {
                  const v = e.target.value;
                  setTxType(v);
                }}
              >
                <option value="CONTRA">CONTRA</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="RECEIVE">RECEIVE</option>
                <option value="CLAIM">CLAIM</option>
                <option value="PROFIT">PROFIT</option>
                <option value="RATE">RATE</option>
                <option value="ADJUSTMENT">ADJUSTMENT</option>
                <option value="CLEAR">CLEAR</option>
              </select>
            </div>

            <div id="standard-transaction-fields" style={{ display: txType === "RATE" ? "none" : "block" }}>
              <div className="transaction-form-group">
                <label className="transaction-label">Date</label>
                <input
                  type="text"
                  id="transaction_date"
                  className="transaction-input"
                  value={txDate || todayDmy}
                  onChange={(e) => setTxDate(e.target.value)}
                  placeholder="dd/mm/yyyy"
                  readOnly
                  style={{ cursor: "pointer" }}
                />
              </div>

              <div className="transaction-form-group transaction-inline-row">
                <label className="transaction-label">Account</label>
                <div className="transaction-account-inputs">
                  <AccountSelect
                    buttonId="action_account_from"
                    dropdownId="action_account_from_dropdown"
                    placeholder="--Select To Account--"
                    options={accountOptions}
                    value={txToAccount}
                    onChange={setTxToAccount}
                    selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                  />
                  {showStandardFromAndReverse ? (
                    <>
                      <AccountSelect
                        buttonId="action_account_id"
                        dropdownId="action_account_id_dropdown"
                        placeholder="--Select From Account--"
                        options={accountOptions}
                        value={txFromAccount}
                        onChange={setTxFromAccount}
                        selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                      />
                      <button type="button" id="account_reverse_btn" className="transaction-account-reverse-btn" title="Reverse accounts" aria-label="Reverse accounts" onClick={onReverseAccounts}>
                        Reverse
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="transaction-form-group transaction-inline-row">
                <label className="transaction-label">Currency</label>
                <select id="transaction_currency" className="transaction-select" value={txCurrency} onChange={(e) => setTxCurrency(e.target.value)}>
                  <option value="">--Select Currency--</option>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="transaction-form-group">
                <label className="transaction-label">Amount</label>
                <input type="number" step="0.01" id="action_amount" className="transaction-input" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
              </div>
            </div>

            <div id="rate-transaction-fields" className="rate-fields" style={{ display: txType === "RATE" ? "flex" : "none" }}>
              <div className="rate-section">
                <label className="transaction-label">Date</label>
                <input type="text" id="rate_transaction_date" className="transaction-input" value={rateDate || todayDmy} placeholder="dd/mm/yyyy" readOnly style={{ cursor: "pointer" }} />
              </div>

              <div className="rate-section">
                <label className="transaction-label">Account</label>
                <div className="rate-row rate-row-two-cols">
                  <div className="custom-select-wrapper">
                    <AccountSelect
                      buttonId="rate_account_from"
                      dropdownId="rate_account_from_dropdown"
                      placeholder="--Select To Account--"
                      options={accountOptions}
                      value={rateToAccount}
                      onChange={setRateToAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                  <div className="custom-select-wrapper">
                    <AccountSelect
                      buttonId="rate_account_to"
                      dropdownId="rate_account_to_dropdown"
                      placeholder="--Select From Account--"
                      options={accountOptions}
                      value={rateFromAccount}
                      onChange={setRateFromAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                  <button
                    type="button"
                    id="rate_account_reverse_btn"
                    className="transaction-account-reverse-btn rate-reverse-btn"
                    title="Reverse accounts"
                    aria-label="Reverse accounts"
                    onClick={() => {
                      setRateToAccount(rateFromAccount);
                      setRateFromAccount(rateToAccount);
                    }}
                  >
                    Reverse
                  </button>
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Currency</label>
                <div className="rate-row rate-row-five-cols">
                  <select id="rate_currency_from" className="transaction-select" value={rateCurrencyFrom} onChange={(e) => setRateCurrencyFrom(e.target.value)}>
                    <option value="">Currency</option>
                    {currencyOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    id="rate_currency_from_amount"
                    className="transaction-input"
                    placeholder="Amount"
                    value={rateCurrencyFromAmount}
                    onChange={(e) => setRateCurrencyFromAmount(e.target.value)}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    id="rate_exchange_rate"
                    className="transaction-input"
                    placeholder="Rate"
                    value={rateExchangeRateRaw}
                    onChange={(e) => setRateExchangeRateRaw(e.target.value)}
                  />
                  <select id="rate_currency_to" className="transaction-select" value={rateCurrencyTo} onChange={(e) => setRateCurrencyTo(e.target.value)}>
                    <option value="">Currency</option>
                    {currencyOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input type="number" step="0.01" id="rate_currency_to_amount" className="transaction-input" placeholder="Amount" readOnly value={rateCurrencyToAmount} />
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Account</label>
                <div className="rate-row rate-row-two-cols">
                  <div className="custom-select-wrapper">
                    <AccountSelect
                      buttonId="rate_transfer_from_account"
                      dropdownId="rate_transfer_from_account_dropdown"
                      placeholder="--Select To Account--"
                      options={accountOptions}
                      value={rateTransferToAccount}
                      onChange={setRateTransferToAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                  <div className="custom-select-wrapper">
                    <AccountSelect
                      buttonId="rate_transfer_to_account"
                      dropdownId="rate_transfer_to_account_dropdown"
                      placeholder="--Select From Account--"
                      options={accountOptions}
                      value={rateTransferFromAccount}
                      onChange={setRateTransferFromAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                  <button
                    type="button"
                    id="rate_transfer_reverse_btn"
                    className="transaction-account-reverse-btn rate-reverse-btn"
                    title="Reverse accounts"
                    aria-label="Reverse accounts"
                    onClick={() => {
                      setRateTransferToAccount(rateTransferFromAccount);
                      setRateTransferFromAccount(rateTransferToAccount);
                    }}
                  >
                    Reverse
                  </button>
                </div>
              </div>

              <div className="rate-section">
                <label className="transaction-label">Middle-Man</label>
                <div className="rate-row rate-row-three-cols">
                  <div className="custom-select-wrapper">
                    <AccountSelect
                      buttonId="rate_middleman_account"
                      dropdownId="rate_middleman_account_dropdown"
                      placeholder="--Select Account--"
                      options={accountOptions}
                      value={rateMiddlemanAccount}
                      onChange={setRateMiddlemanAccount}
                      selectedCategories={selectedCategories.length === 0 ? [] : selectedCategories}
                    />
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    id="rate_middleman_rate"
                    className="transaction-input"
                    placeholder="Rate multiplier"
                    value={rateMiddlemanRate}
                    onChange={(e) => setRateMiddlemanRate(e.target.value)}
                  />
                  <input type="number" step="0.01" id="rate_middleman_amount" className="transaction-input" placeholder="Amount" readOnly value={rateMiddlemanAmount} />
                </div>
              </div>
            </div>

            <div className="transaction-two-col">
              {txType === "PROFIT" && (
                <div className="transaction-form-group">
                  <label className="transaction-label">Win/Lose</label>
                  <div className="transaction-win-lose-row">
                    <label className="transaction-radio-label">
                      <input type="radio" name="win_lose_side" value="WIN" checked={winLoseSide === "WIN"} onChange={() => setWinLoseSide("WIN")} />
                      WIN
                    </label>
                    <label className="transaction-radio-label">
                      <input type="radio" name="win_lose_side" value="LOSE" checked={winLoseSide === "LOSE"} onChange={() => setWinLoseSide("LOSE")} />
                      LOSE
                    </label>
                  </div>
                </div>
              )}
              <div className="transaction-form-group" style={{ display: "none" }}>
                <label className="transaction-label">Description</label>
                <input type="text" id="action_description" className="transaction-input text-uppercase" />
              </div>
              <div className="transaction-form-group" id="remark_form_group" style={{ display: txType === "RATE" ? "none" : undefined }}>
                <label className="transaction-label">Remark</label>
                <input type="text" id="action_sms" className="transaction-input text-uppercase" value={txRemark} onChange={(e) => setTxRemark(e.target.value.toUpperCase())} />
              </div>
            </div>

            <div className="transaction-confirm-actions">
              <label className="transaction-checkbox-label transaction-confirm-label">
                <input type="checkbox" id="confirm_submit" className="transaction-checkbox" checked={txConfirm} onChange={(e) => setTxConfirm(e.target.checked)} />
                Confirm Submit
              </label>
              <div className="transaction-action-btns">
                <button type="button" id="submit_btn" className="transaction-submit-btn" disabled={!txConfirm || submitting} onClick={onSubmitTx}>
                  {submitting ? "Submitting..." : "Submit"}
                </button>
                  <button type="button" id="action_search_btn" className="transaction-search-btn" onClick={onSearch} disabled={searchLoading}>
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="transaction-tables-section" style={{ display: tablesVisible ? "block" : "none" }}>
          <div id="transaction-tables-loading" className="transaction-tables-loading" style={{ display: searchLoading ? "flex" : "none" }} aria-live="polite">
            Loading data
          </div>
          <div
            id="default-tables-container"
            style={{
              display: tp.mode === "default" ? "flex" : "none",
              flexDirection: "column",
              width: "100%",
            }}
          >
            {tp.singleCurrencyTitle ? (
              <h3
                id="default-currency-title"
                style={{ margin: "10px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937", display: "block" }}
              >
                {tp.singleCurrencyTitle}
              </h3>
            ) : null}
            <div style={{ display: "flex", gap: 20, width: "100%" }}>
              <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                <table className="transaction-table" id="table_left">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_left">
                    {(tp.defaultLeft || []).map((row) => {
                      const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                      const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                      return (
                        <tr
                          key={`${row.account_db_id}-${row.currency || ""}`}
                          className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}
                        >
                          <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                            {row.account_id}
                          </td>
                          <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                            {toUpperDisplay(row.account_name)}
                          </td>
                          <td>{formatPaymentHistoryMoney(row.bf)}</td>
                          <td>{formatPaymentHistoryMoney(row.win_loss)}</td>
                          <td>{formatPaymentHistoryMoney(row.cr_dr)}</td>
                          <td
                            className="transaction-balance-cell"
                            style={{ cursor: "pointer" }}
                            onClick={() => handleBalanceCellClick(row, true)}
                          >
                            {formatPaymentHistoryMoney(row.balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                      <td id="left_total_bf">{formatPaymentHistoryMoney(tp.totalsLeft?.bf ?? "0")}</td>
                      <td id="left_total_winloss">{formatPaymentHistoryMoney(tp.totalsLeft?.win_loss ?? "0")}</td>
                      <td id="left_total_crdr">{formatPaymentHistoryMoney(tp.totalsLeft?.cr_dr ?? "0")}</td>
                      <td id="left_total_balance">{formatPaymentHistoryMoney(tp.totalsLeft?.balance ?? "0")}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                <table className="transaction-table" id="table_right">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_right">
                    {(tp.defaultRight || []).map((row) => {
                      const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                      const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                      return (
                        <tr
                          key={`${row.account_db_id}-${row.currency || ""}`}
                          className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}
                        >
                          <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                            {row.account_id}
                          </td>
                          <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                            {toUpperDisplay(row.account_name)}
                          </td>
                          <td>{formatPaymentHistoryMoney(row.bf)}</td>
                          <td>{formatPaymentHistoryMoney(row.win_loss)}</td>
                          <td>{formatPaymentHistoryMoney(row.cr_dr)}</td>
                          <td
                            className="transaction-balance-cell"
                            style={{ cursor: "pointer" }}
                            onClick={() => handleBalanceCellClick(row, false)}
                          >
                            {formatPaymentHistoryMoney(row.balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                      <td id="right_total_bf">{formatPaymentHistoryMoney(tp.totalsRight?.bf ?? "0")}</td>
                      <td id="right_total_winloss">{formatPaymentHistoryMoney(tp.totalsRight?.win_loss ?? "0")}</td>
                      <td id="right_total_crdr">{formatPaymentHistoryMoney(tp.totalsRight?.cr_dr ?? "0")}</td>
                      <td id="right_total_balance">{formatPaymentHistoryMoney(tp.totalsRight?.balance ?? "0")}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
          <div id="currency-grouped-tables-container" style={{ display: tp.mode === "grouped" ? "block" : "none", width: "100%" }}>
            {(tp.grouped || []).map((g) => (
              <div key={g.currency} style={{ marginBottom: 24 }}>
                <h3 style={{ margin: "20px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937" }}>
                  Currency: {g.currency}
                </h3>
                <div style={{ display: "flex", gap: 20, width: "100%" }}>
                  <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                    <table className="transaction-table">
                      <thead>
                        <tr className="transaction-table-header">
                          <th>Account</th>
                          <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                            Name
                          </th>
                          <th>B/F</th>
                          <th>Win/Loss</th>
                          <th>Cr/Dr</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(g.left || []).map((row) => {
                          const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                          const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                          return (
                            <tr
                              key={`L-${row.account_db_id}-${row.currency || ""}`}
                              className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}
                            >
                              <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                                {row.account_id}
                              </td>
                              <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                                {toUpperDisplay(row.account_name)}
                              </td>
                              <td>{formatPaymentHistoryMoney(row.bf)}</td>
                              <td>{formatPaymentHistoryMoney(row.win_loss)}</td>
                              <td>{formatPaymentHistoryMoney(row.cr_dr)}</td>
                              <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, true)}>
                                {formatPaymentHistoryMoney(row.balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-footer">
                          <td>Total</td>
                          <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                          <td>{formatPaymentHistoryMoney(g.totalsLeft?.bf ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(g.totalsLeft?.win_loss ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(g.totalsLeft?.cr_dr ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(g.totalsLeft?.balance ?? "0")}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                    <table className="transaction-table">
                      <thead>
                        <tr className="transaction-table-header">
                          <th>Account</th>
                          <th className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                            Name
                          </th>
                          <th>B/F</th>
                          <th>Win/Loss</th>
                          <th>Cr/Dr</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(g.right || []).map((row) => {
                          const roleClass = getRoleClass(row.role || "") || fallbackRoleClass;
                          const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : "transaction-account-cell";
                          return (
                            <tr
                              key={`R-${row.account_db_id}-${row.currency || ""}`}
                              className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}
                            >
                              <td className={accountCellClass} style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                                {row.account_id}
                              </td>
                              <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                                {toUpperDisplay(row.account_name)}
                              </td>
                              <td>{formatPaymentHistoryMoney(row.bf)}</td>
                              <td>{formatPaymentHistoryMoney(row.win_loss)}</td>
                              <td>{formatPaymentHistoryMoney(row.cr_dr)}</td>
                              <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => handleBalanceCellClick(row, false)}>
                                {formatPaymentHistoryMoney(row.balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-footer">
                          <td>Total</td>
                          <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                          <td>{formatPaymentHistoryMoney(g.totalsRight?.bf ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(g.totalsRight?.win_loss ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(g.totalsRight?.cr_dr ?? "0")}</td>
                          <td>{formatPaymentHistoryMoney(g.totalsRight?.balance ?? "0")}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                <div style={{ margin: "12px auto", maxWidth: 400 }}>
                  <table className="transaction-summary-table" style={{ margin: "0 auto", maxWidth: 400 }}>
                    <thead>
                      <tr className="transaction-table-header">
                        <th colSpan={2}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="transaction-table-row">
                        <td className="transaction-summary-label">B/F</td>
                        <td>{formatPaymentHistoryMoney(g.totalsSummary?.bf ?? "0")}</td>
                      </tr>
                      <tr className="transaction-table-row">
                        <td className="transaction-summary-label">Win/Loss</td>
                        <td>{formatPaymentHistoryMoney(g.totalsSummary?.win_loss ?? "0")}</td>
                      </tr>
                      <tr className="transaction-table-row">
                        <td className="transaction-summary-label">Cr/Dr</td>
                        <td>{formatPaymentHistoryMoney(g.totalsSummary?.cr_dr ?? "0")}</td>
                      </tr>
                      <tr className="transaction-table-row">
                        <td className="transaction-summary-label">Balance</td>
                        <td>{formatPaymentHistoryMoney(g.totalsSummary?.balance ?? "0")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="transaction-summary-section" style={{ display: tablesVisible && tp.mode !== "grouped" ? "block" : "none" }}>
          <table className="transaction-summary-table">
            <thead>
              <tr className="transaction-table-header">
                <th colSpan={2}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">B/F</td>
                <td id="sum_total_bf">{formatPaymentHistoryMoney(tp.totalsSummary?.bf ?? "0")}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Win/Loss</td>
                <td id="sum_total_winloss">{formatPaymentHistoryMoney(tp.totalsSummary?.win_loss ?? "0")}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Cr/Dr</td>
                <td id="sum_total_crdr">{formatPaymentHistoryMoney(tp.totalsSummary?.cr_dr ?? "0")}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Balance</td>
                <td id="sum_total_balance">{formatPaymentHistoryMoney(tp.totalsSummary?.balance ?? "0")}</td>
              </tr>
            </tbody>
          </table>
        </div>
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

      <div id="historyModal" className="transaction-modal" style={{ display: history.open ? "flex" : "none" }}>
        <div className="transaction-modal-content">
          <div className="transaction-modal-header">
            <h3 id="modal_title">{history.title}</h3>
            <button
              type="button"
              id="modal_close"
              className="transaction-modal-close"
              onClick={() => setHistory((h) => ({ ...h, open: false }))}
            >
              ×
            </button>
          </div>
          <div className="transaction-modal-body" style={{ position: "relative" }}>
            {history.loading ? (
              <div
                className="transaction-tables-loading"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.75)",
                  zIndex: 2,
                }}
                aria-live="polite"
              >
                Loading history…
              </div>
            ) : null}
            <div className="transaction-history-table-frame">
              <table className="transaction-table">
                <thead>
                  <tr className="transaction-table-header">
                    <th className="transaction-history-col-date">Date</th>
                    <th className="transaction-history-col-product">Id Product</th>
                    <th className="transaction-history-col-currency">Currency</th>
                    <th className="transaction-history-col-rate">Rate</th>
                    <th className="transaction-history-col-winloss">Win/Loss</th>
                    <th className="transaction-history-col-crdr">Cr/Dr</th>
                    <th className="transaction-history-col-balance">Balance</th>
                    {TRANSACTION_SHOW_DESCRIPTION_COLUMN ? (
                      <th className="transaction-history-col-description">Description</th>
                    ) : null}
                    <th className="transaction-history-col-remark">Remark</th>
                    <th className="transaction-history-col-created">Created by</th>
                  </tr>
                </thead>
                <tbody id="modal_tbody">
                  {history.rows.map((r, idx) => {
                    const isBf = r.row_type === "bf";
                    const idProductDisplay = r.is_bank_process_transaction ? r.card_owner || "-" : r.product || "-";
                    const createdRaw = r.created_by;
                    const createdByDisplay =
                      createdRaw === null ||
                      createdRaw === undefined ||
                      String(createdRaw).trim() === "" ||
                      String(createdRaw).toLowerCase() === "null"
                        ? "-"
                        : String(createdRaw);
                    return (
                      <tr
                        key={r.id ?? `${idx}-${r.date || ""}-${r.balance || ""}`}
                        className={isBf ? "transaction-bf-row" : "transaction-table-row"}
                        style={
                          isBf
                            ? {
                                fontWeight: "bold",
                                backgroundColor: "#f0f0f0",
                              }
                            : undefined
                        }
                      >
                        <td className="transaction-history-col-date">{r.date || "-"}</td>
                        <td className="transaction-history-col-product">{String(idProductDisplay)}</td>
                        <td className="transaction-history-col-currency">{r.currency || "-"}</td>
                        <td className="transaction-history-col-rate">{r.rate || "-"}</td>
                        <td className="transaction-history-col-winloss">{histMoney(r.win_loss)}</td>
                        <td className="transaction-history-col-crdr">{histMoney(r.cr_dr)}</td>
                        <td className="transaction-history-col-balance">{histMoney(r.balance)}</td>
                        {TRANSACTION_SHOW_DESCRIPTION_COLUMN ? (
                          <td className="transaction-history-col-description text-uppercase">{toUpperDisplay(r.description)}</td>
                        ) : null}
                        <td className="transaction-history-col-remark text-uppercase">{getHistoryRemark(r)}</td>
                        <td className="transaction-history-col-created">{createdByDisplay}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
