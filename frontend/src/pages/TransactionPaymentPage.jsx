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
  loadContraInbox,
  searchTransactions as searchTransactionsApi,
  submitTransaction,
} from "./transaction/transactionApi.js";
import { buildClientRequestId, formatDmy, formatMoney2, formatRateAmount, parseRateExpression, toUpperDisplay } from "./transaction/transactionFormat.js";

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
  const searchRef = useRef(null);

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
    } else {
      setFilter("");
    }
  }, [open]);

  const displayText = value?.display_text ? value.display_text : placeholder;

  return (
    <div className="custom-select-wrapper">
      <button
        type="button"
        className={`custom-select-button${open ? " open" : ""}`}
        id={buttonId}
        data-placeholder={placeholder}
        data-account-id={value?.id ?? ""}
        data-account-code={value?.account_id ?? ""}
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
              if (e.key === "Escape") setOpen(false);
            }}
          />
        </div>
        <div className="custom-select-options">
          {filtered.length === 0 ? (
            <div className="custom-select-no-results">No results</div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.id}
                className={`custom-select-option${String(value?.id) === String(opt.id) ? " selected" : ""}`}
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
  const [tablesVisible, setTablesVisible] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchData, setSearchData] = useState(null);
  const [history, setHistory] = useState({ open: false, title: "Payment History", rows: [] });
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

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
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
        setCategories(roles.map((r) => String(r).toUpperCase()));
      } catch {
        setCategories([]);
      }

      try {
        const [acc, cur] = await Promise.all([
          getAccounts({ companyId: filterSnapshot.companyId }),
          getCompanyCurrencies({ companyId: filterSnapshot.companyId }),
        ]);
        setAccountOptions(Array.isArray(acc?.data) ? acc.data : []);
        const currencies = Array.isArray(cur?.data) ? cur.data : [];
        const codes = currencies
          .map((x) => String(x.code || x.currency || x).toUpperCase().trim())
          .filter(Boolean);
        setCurrencyOptions([...new Set(codes)]);
      } catch {
        setAccountOptions([]);
        setCurrencyOptions([]);
      }
    })();
  }, [loading, forbidden, filterSnapshot, todayDmy]);

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

  const selectQuickRange = (key) => {
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
    setQuickOpen(false);
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


  const onSearch = async () => {
    if (!fs?.companyId) return;
    setSearchLoading(true);
    setTablesVisible(true);
    try {
      const result = await searchTransactionsApi({
        companyId: fs.companyId,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        showInactive: searchState.showPaymentOnly,
        showCaptureOnly: searchState.showCaptureOnly,
        hideZeroBalance: !searchState.showZeroBalance,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      });
      if (result?.success && result?.data) {
        setSearchData(result.data);
      } else {
        setSearchData({ left_table: [], right_table: [], totals: null });
        pushToast(result?.message || "Search failed", "error");
      }
    } catch (e) {
      console.error(e);
      pushToast("Network error. Please try again.", "error");
    } finally {
      setSearchLoading(false);
    }
  };

  const effectiveType = txType === "PROFIT" ? winLoseSide : txType;
  const needsFromTo = ["CONTRA", "PAYMENT", "RECEIVE", "CLAIM", "CLEAR"].includes(effectiveType);
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
          pushToast(res?.message || "RATE transaction submitted successfully", "success");
          setTxConfirm(false);
          setRateCurrencyFromAmount("");
          setRateExchangeRateRaw("");
          setRateCurrencyToAmount("");
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
        pushToast(res?.message || "Transaction submitted successfully", "success");
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

  const openHistory = async (row) => {
    const aid = row?.account_db_id;
    if (!aid) return;
    const title = `Payment History - ${row.account_id || ""}${row.account_name ? ` (${toUpperDisplay(row.account_name)})` : ""}`;
    setHistory({ open: true, title, rows: [] });
    try {
      const data = await getHistory({
        companyId: fs.companyId,
        accountId: aid,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        currency: row.currency || "",
      });
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.rows) ? data.rows : [];
      setHistory({ open: true, title, rows });
    } catch {
      setHistory({ open: true, title, rows: [] });
      pushToast("Failed to load history", "error");
    }
  };

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
                          <tr key={it.id || `${it.transaction_id}-${it.date}`}>
                            <td>{it.date || "-"}</td>
                            <td>{toUpperDisplay(it.from_account_id || it.from || "-")}</td>
                            <td>{toUpperDisplay(it.to_account_id || it.to || "-")}</td>
                            <td>{toUpperDisplay(it.currency || "-")}</td>
                            <td>{formatMoney2(it.amount)}</td>
                            <td>{toUpperDisplay(it.submitted_by || it.created_by || "-")}</td>
                            <td>{toUpperDisplay(it.description || "-")}</td>
                            <td>
                              <button
                                type="button"
                                className="contra-inbox-btn"
                                onClick={async () => {
                                  const tid = it.transaction_id || it.id;
                                  if (!tid) return;
                                  const res = await approveContra({ transactionId: tid });
                                  if (res?.success) {
                                    pushToast("Approved", "success");
                                    await refreshContraInbox();
                                  } else {
                                    pushToast(res?.message || "Approve failed", "error");
                                  }
                                }}
                              >
                                Approve
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
                          <span key={c} className="category-tag">
                            {c}
                          </span>
                        ))
                      )}
                    </div>
                    <i className="fas fa-chevron-down" />
                  </button>
                  <div className="category-dropdown-menu" id="category_dropdown_menu" style={{ display: categoryOpen ? "block" : "none" }}>
                    <div className="category-option">
                      <label className="category-checkbox-label">
                        <input
                          type="checkbox"
                          value=""
                          className="category-checkbox"
                          id="category_all"
                          checked={selectedCategories.length === 0}
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
                <input type="hidden" id="date_from" value={effectiveDateFrom} readOnly />
                <input type="hidden" id="date_to" value={effectiveDateTo} readOnly />
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
                <div className="dropdown-menu" id="quick-select-dropdown" style={{ display: quickOpen ? "block" : "none" }}>
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
                      >
                        {comp.company_id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div id="currency-buttons-wrapper" className="transaction-company-filter">
                <span className="transaction-company-label">Currency:</span>
                <div id="currency-buttons-container" className="transaction-company-buttons" />
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

            <div id="rate-transaction-fields" className="rate-fields" style={{ display: txType === "RATE" ? "block" : "none" }}>
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
              <div className="transaction-form-group" id="remark_form_group">
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
          <div id="transaction-tables-loading" className="transaction-tables-loading" style={{ display: "none" }} aria-live="polite">
            Loading...
          </div>
          <div id="default-tables-container" style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <h3 id="default-currency-title" style={{ margin: "10px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937", display: "none" }}>
              Currency:{" "}
            </h3>
            <div style={{ display: "flex", gap: 20, width: "100%" }}>
              <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                <table className="transaction-table" id="table_left">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th className="transaction-name-column" style={{ display: "none" }}>
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_left">
                    {(searchData?.left_table || []).map((row) => (
                      <tr key={`${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                        <td className="transaction-account-cell" style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                          {row.account_id}
                        </td>
                        <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                          {toUpperDisplay(row.account_name)}
                        </td>
                        <td>{formatMoney2(row.bf)}</td>
                        <td>{formatMoney2(row.win_loss)}</td>
                        <td>{formatMoney2(row.cr_dr)}</td>
                        <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                          {formatMoney2(row.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                      <td id="left_total_bf">{formatMoney2(searchData?.totals?.left?.bf ?? "0.00")}</td>
                      <td id="left_total_winloss">{formatMoney2(searchData?.totals?.left?.win_loss ?? "0.00")}</td>
                      <td id="left_total_crdr">{formatMoney2(searchData?.totals?.left?.cr_dr ?? "0.00")}</td>
                      <td id="left_total_balance">{formatMoney2(searchData?.totals?.left?.balance ?? "0.00")}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="transaction-table-wrapper" style={{ flex: "1 1 0", minWidth: 0 }}>
                <table className="transaction-table" id="table_right">
                  <thead>
                    <tr className="transaction-table-header">
                      <th>Account</th>
                      <th className="transaction-name-column" style={{ display: "none" }}>
                        Name
                      </th>
                      <th>B/F</th>
                      <th>Win/Loss</th>
                      <th>Cr/Dr</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody id="tbody_right">
                    {(searchData?.right_table || []).map((row) => (
                      <tr key={`${row.account_db_id}-${row.currency || ""}`} className={`transaction-table-row${row.is_alert == 1 || row.is_alert === true ? " transaction-alert-row" : ""}`}>
                        <td className="transaction-account-cell" style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                          {row.account_id}
                        </td>
                        <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }}>
                          {toUpperDisplay(row.account_name)}
                        </td>
                        <td>{formatMoney2(row.bf)}</td>
                        <td>{formatMoney2(row.win_loss)}</td>
                        <td>{formatMoney2(row.cr_dr)}</td>
                        <td className="transaction-balance-cell" style={{ cursor: "pointer" }} onClick={() => openHistory(row)}>
                          {formatMoney2(row.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="transaction-table-footer">
                      <td>Total</td>
                      <td className="transaction-name-column" style={{ display: searchState.showName ? "" : "none" }} />
                      <td id="right_total_bf">{formatMoney2(searchData?.totals?.right?.bf ?? "0.00")}</td>
                      <td id="right_total_winloss">{formatMoney2(searchData?.totals?.right?.win_loss ?? "0.00")}</td>
                      <td id="right_total_crdr">{formatMoney2(searchData?.totals?.right?.cr_dr ?? "0.00")}</td>
                      <td id="right_total_balance">{formatMoney2(searchData?.totals?.right?.balance ?? "0.00")}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
          <div id="currency-grouped-tables-container" style={{ display: "none" }} />
        </div>

        <div className="transaction-summary-section" style={{ display: tablesVisible ? "block" : "none" }}>
          <table className="transaction-summary-table">
            <thead>
              <tr className="transaction-table-header">
                <th colSpan={2}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">B/F</td>
                <td id="sum_total_bf">{formatMoney2(searchData?.totals?.summary?.bf ?? "0.00")}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Win/Loss</td>
                <td id="sum_total_winloss">{formatMoney2(searchData?.totals?.summary?.win_loss ?? "0.00")}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Cr/Dr</td>
                <td id="sum_total_crdr">{formatMoney2(searchData?.totals?.summary?.cr_dr ?? "0.00")}</td>
              </tr>
              <tr className="transaction-table-row">
                <td className="transaction-summary-label">Balance</td>
                <td id="sum_total_balance">{formatMoney2(searchData?.totals?.summary?.balance ?? "0.00")}</td>
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

      <div id="historyModal" className="transaction-modal" style={{ display: history.open ? "block" : "none" }}>
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
          <div className="transaction-modal-body">
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
                    <th className="transaction-history-col-description">Description</th>
                    <th className="transaction-history-col-remark">Remark</th>
                    <th className="transaction-history-col-created">Created by</th>
                  </tr>
                </thead>
                <tbody id="modal_tbody">
                  {history.rows.map((r, idx) => (
                    <tr key={r.id || `${idx}-${r.date || ""}`} className="transaction-table-row">
                      <td>{r.date || "-"}</td>
                      <td>{toUpperDisplay(r.product_id || r.id_product || r.product || "-")}</td>
                      <td>{toUpperDisplay(r.currency || "-")}</td>
                      <td>{toUpperDisplay(r.rate || "-")}</td>
                      <td>{formatMoney2(r.win_loss)}</td>
                      <td>{formatMoney2(r.cr_dr)}</td>
                      <td>{formatMoney2(r.balance)}</td>
                      <td>{toUpperDisplay(r.description || "-")}</td>
                      <td>{toUpperDisplay(r.remark || r.sms || "-")}</td>
                      <td>{toUpperDisplay(r.created_by || r.created || "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
