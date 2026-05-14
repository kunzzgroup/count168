import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import { injectStylesheet } from "../../utils/injectStylesheet.js";
import "../../../public/css/member.css";
import ConfirmLogoutModal from "../../components/ConfirmLogoutModal.jsx";

function dmy(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear());
  return `${d}/${m}/${y}`;
}

function parseDmy(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatMoney(v) {
  const n = Number(String(v ?? "0").replace(/,/g, ""));
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatHistoryMoney(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "0.00";
  const exact2 = cleaned.match(/^(-?)(\d+)\.(\d{2})$/);
  if (exact2) {
    const neg = exact2[1] === "-" ? "-" : "";
    const intWithSep = exact2[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${neg}${intWithSep}.${exact2[3]}`;
  }
  return formatMoney(cleaned);
}

function parseMoneyToCents(value) {
  if (value === "-" || value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function parseJsonResponse(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    if (start === -1) throw new Error("Invalid JSON response");
    let depth = 0;
    let inString = false;
    let escaped = false;
    let quote = "";
    let end = -1;
    for (let i = start; i < raw.length; i += 1) {
      const ch = raw[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") escaped = true;
        else if (ch === quote) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) throw new Error("Invalid JSON response");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const AVATAR_MAP = {
  male1: assetUrl("images/avatar1.png"),
  male2: assetUrl("images/avatar2.png"),
  male3: assetUrl("images/avatar3.png"),
  male4: assetUrl("images/avatar4.png"),
  male5: assetUrl("images/avatar5.png"),
  male6: assetUrl("images/avatar6.png"),
  male7: assetUrl("images/avatar7.png"),
  male8: assetUrl("images/avatar8.png"),
  male9: assetUrl("images/avatar9.png"),
  female1: assetUrl("images/female1.png"),
  female2: assetUrl("images/female2.png"),
  female3: assetUrl("images/female3.png"),
  female4: assetUrl("images/female4.png"),
  female5: assetUrl("images/female5.png"),
  female6: assetUrl("images/female6.png"),
  female7: assetUrl("images/female7.png"),
  female8: assetUrl("images/female8.png"),
  female9: assetUrl("images/female9.png"),
};

export default function MemberPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [currencySummary, setCurrencySummary] = useState([]);
  const [accountCurrencies, setAccountCurrencies] = useState([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [currencyOrder, setCurrencyOrder] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const initialAvatarId = readCookie("selectedAvatar") || "male1";
  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [selectedGender, setSelectedGender] = useState(initialAvatarId.startsWith("female") ? "female" : "male");
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [accountId, setAccountId] = useState(0);
  const [companyId, setCompanyId] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const [quickRangeLabel, setQuickRangeLabel] = useState("Period");
  const avatarSrc = useMemo(() => AVATAR_MAP[selectedAvatarId] || AVATAR_MAP.male1, [selectedAvatarId]);
  const avatarContainerRef = useRef(null);
  const quickSelectRef = useRef(null);
  const dateRangeInputRef = useRef(null);
  const flatpickrRef = useRef(null);
  const lastRangeRef = useRef({ from: "", to: "" });
  const summaryAbortRef = useRef(null);
  const historyAbortRef = useRef(null);
  const searchSeqRef = useRef(0);

  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => {
    const t = new Date(today);
    const day = t.getDay();
    const toMonday = day === 0 ? 6 : day - 1;
    t.setDate(t.getDate() - toMonday);
    return t;
  }, [today]);

  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("transaction-page", "member-winloss-page");
    return () => {
      document.body.classList.remove("transaction-page", "member-winloss-page");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() !== "member") {
          navigate("/dashboard", { replace: true });
          return;
        }
        const cRes = await fetch(
          buildApiUrl(`api/accounts/account_company_api.php?action=get_account_companies&account_id=${u.user_id}`),
          { credentials: "include" },
        );
        const cJson = await cRes.json();
        if (!cancelled) {
          setMe(u);
          setCompanies(Array.isArray(cJson?.data) ? cJson.data : []);
          setAccountId(Number(u.user_id) || 0);
          setCompanyId(Number(u.company_id) || 0);
          setDateFrom(dmy(monday));
          setDateTo(dmy(today));
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
  }, [navigate, monday, today]);

  useEffect(() => {
    if (loading || !me || !dateFrom || !dateTo) return;
    let cancelled = false;
    (async () => {
      await injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css");
      if (cancelled) return;
      const inputEl = dateRangeInputRef.current;
      const fromDate = parseDmy(dateFrom);
      const toDate = parseDmy(dateTo);
      if (inputEl && fromDate && toDate) {
        flatpickrRef.current = flatpickr(inputEl, {
          mode: "range",
          dateFormat: "d/m/Y",
          defaultDate: [fromDate, toDate],
          onChange: (dates) => {
            if (dates.length === 2) {
              setDateFrom(dmy(dates[0]));
              setDateTo(dmy(dates[1]));
            }
          },
          onClose: (dates) => {
            // Keep legacy behavior: single picked day becomes from/to same day.
            if (dates.length === 1) {
              const single = dmy(dates[0]);
              setDateFrom(single);
              setDateTo(single);
              if (flatpickrRef.current) flatpickrRef.current.setDate([dates[0], dates[0]], false);
            }
          },
        });
      }
    })();
    return () => {
      cancelled = true;
      if (flatpickrRef.current && typeof flatpickrRef.current.destroy === "function") {
        flatpickrRef.current.destroy();
        flatpickrRef.current = null;
      }
    };
  }, [loading, me]);

  useEffect(() => {
    const fp = flatpickrRef.current;
    if (!fp || !dateFrom || !dateTo) return;
    const last = lastRangeRef.current;
    if (last.from === dateFrom && last.to === dateTo) return;
    const fromDate = parseDmy(dateFrom);
    const toDate = parseDmy(dateTo);
    if (fromDate && toDate) {
      fp.setDate([fromDate, toDate], false);
      lastRangeRef.current = { from: dateFrom, to: dateTo };
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (avatarContainerRef.current && !avatarContainerRef.current.contains(e.target)) {
        setShowAvatarOptions(false);
      }
      if (quickSelectRef.current && !quickSelectRef.current.contains(e.target)) {
        setShowQuickSelect(false);
      }
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  useEffect(() => {
    if (!accountId || !companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          buildApiUrl(`api/accounts/account_link_api.php?action=get_all_linked_accounts&account_id=${accountId}&company_id=${companyId}`),
          { credentials: "include" },
        );
        const json = await res.json();
        if (!cancelled) setLinkedAccounts(Array.isArray(json?.data) ? json.data : []);
      } catch {
        if (!cancelled) setLinkedAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, companyId]);

  useEffect(() => {
    if (!accountId || !companyId) {
      setAccountCurrencies([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          buildApiUrl(
            `api/accounts/account_currency_api.php?action=get_account_currencies&account_id=${accountId}&company_id=${companyId}`,
          ),
          { credentials: "include", cache: "no-store" },
        );
        const json = await res.json();
        if (!cancelled) {
          const linkedCodes = Array.isArray(json?.data)
            ? json.data
                .map((c) => String(c.currency_code || c.code || "").trim().toUpperCase())
                .filter(Boolean)
            : [];
          setAccountCurrencies(linkedCodes);
        }
      } catch {
        if (!cancelled) setAccountCurrencies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, companyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!cancelled) {
          setCurrencyOrder(Array.isArray(json?.data?.order) ? json.data.order : []);
        }
      } catch {
        if (!cancelled) setCurrencyOrder([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showNotification = useCallback((message, type = "info") => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications((prev) => {
      const next = [...prev, { id, message, type }];
      return next.slice(-2);
    });
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 2500);
  }, []);

  const performMemberSearch = useCallback(async () => {
    if (!accountId || !companyId || !dateFrom || !dateTo) return;
    searchSeqRef.current += 1;
    const seq = searchSeqRef.current;

    if (summaryAbortRef.current) summaryAbortRef.current.abort();
    if (historyAbortRef.current) historyAbortRef.current.abort();
    summaryAbortRef.current = new AbortController();
    historyAbortRef.current = new AbortController();

    setLoadingTable(true);
    try {
      const summaryParams = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        target_account_id: String(accountId),
        company_id: String(companyId),
        show_inactive: "1",
        hide_zero_balance: "0",
      });
      const summaryRes = await fetch(buildApiUrl(`api/transactions/search_api.php?${summaryParams.toString()}`), {
        credentials: "include",
        cache: "no-store",
        signal: summaryAbortRef.current.signal,
      });
      const summaryText = await summaryRes.text();
      const summaryJson = parseJsonResponse(summaryText);
      if (!summaryJson?.success) throw new Error(summaryJson?.error || "Failed to load currency summary");

      const rows = [...(summaryJson?.data?.left_table || []), ...(summaryJson?.data?.right_table || [])].filter(
        (r) => Number(r.account_db_id) === Number(accountId)
      );
      if (seq !== searchSeqRef.current) return;
      setCurrencySummary(rows);
      setIsAllSelected(true);
      setSelectedCurrencies([]);

      const historyParams = new URLSearchParams({
        account_id: String(accountId),
        date_from: dateFrom,
        date_to: dateTo,
        company_id: String(companyId),
      });
      const historyRes = await fetch(buildApiUrl(`api/transactions/history_api.php?${historyParams.toString()}`), {
        credentials: "include",
        cache: "no-store",
        signal: historyAbortRef.current.signal,
      });
      const historyText = await historyRes.text();
      const historyJson = parseJsonResponse(historyText);
      if (!historyJson?.success) throw new Error(historyJson?.error || "No data in the selected date range.");
      if (seq !== searchSeqRef.current) return;
      setHistoryRows(Array.isArray(historyJson?.data?.history) ? historyJson.data.history : []);
      showNotification("Query completed", "success");
    } catch (e) {
      if (e?.name === "AbortError") return;
      if (seq !== searchSeqRef.current) return;
      setCurrencySummary([]);
      setHistoryRows([]);
      showNotification(e?.message || "Failed to load member data.", "error");
    } finally {
      if (seq === searchSeqRef.current) setLoadingTable(false);
    }
  }, [accountId, companyId, dateFrom, dateTo, showNotification]);

  useEffect(() => {
    performMemberSearch();
    return () => {
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
    };
  }, [performMemberSearch]);

  const availableCurrencies = useMemo(() => {
    const accountCodes = accountCurrencies.map((c) => String(c || "").trim()).filter(Boolean);
    const summaryCodes = currencySummary.map((r) => String(r.currency || "").trim()).filter(Boolean);
    const historyCodes = historyRows.map((r) => String(r.currency || "").trim()).filter(Boolean);
    const merged = [...new Set([...accountCodes, ...summaryCodes, ...historyCodes, ...currencyOrder.filter(Boolean)])];
    if (!currencyOrder.length) return merged;
    const orderSet = new Set(currencyOrder);
    const ordered = currencyOrder.filter((c) => merged.includes(c));
    const rest = merged.filter((c) => !orderSet.has(c));
    return [...ordered, ...rest];
  }, [accountCurrencies, currencySummary, historyRows, currencyOrder]);

  useEffect(() => {
    if (!availableCurrencies.length) {
      setIsAllSelected(true);
      setSelectedCurrencies([]);
      return;
    }
    setSelectedCurrencies((prev) => prev.filter((code) => availableCurrencies.includes(code)));
  }, [availableCurrencies]);

  const groupedRows = useMemo(() => {
    const map = new Map();
    for (const row of historyRows) {
      const c = String(row.currency || "-").trim() || "-";
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(row);
    }
    if (isAllSelected) {
      const order = availableCurrencies.length > 0 ? availableCurrencies : Array.from(map.keys());
      return order.map((c) => [c, map.get(c) || []]);
    }
    if (!selectedCurrencies.length) return [];
    return selectedCurrencies.map((c) => [c, map.get(c) || []]);
  }, [historyRows, isAllSelected, selectedCurrencies, availableCurrencies]);

  const handleSelectAvatar = (avatarId) => {
    setSelectedAvatarId(avatarId);
    setShowAvatarOptions(false);
    document.cookie = `selectedAvatar=${encodeURIComponent(avatarId)}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("selectedAvatar", avatarId);
    } catch {
      // ignore
    }
  };

  const applyQuickRange = (range) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    switch (range) {
      case "today":
        break;
      case "yesterday":
        start.setDate(start.getDate() - 1);
        end = new Date(start);
        break;
      case "thisWeek": {
        const dow = now.getDay();
        const toMon = dow === 0 ? 6 : dow - 1;
        start.setDate(start.getDate() - toMon);
        break;
      }
      case "lastWeek": {
        const dow = now.getDay();
        const toSun = dow === 0 ? 0 : dow;
        end.setDate(end.getDate() - toSun - 1);
        start = new Date(end);
        start.setDate(start.getDate() - 6);
        break;
      }
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "lastMonth":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "thisYear":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "lastYear":
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }
    const labelMap = {
      today: "Today",
      yesterday: "Yesterday",
      thisWeek: "This Week",
      lastWeek: "Last Week",
      thisMonth: "This Month",
      lastMonth: "Last Month",
      thisYear: "This Year",
      lastYear: "Last Year",
    };
    setQuickRangeLabel(labelMap[range] || "Period");
    setDateFrom(dmy(start));
    setDateTo(dmy(end));
    if (flatpickrRef.current) flatpickrRef.current.setDate([start, end], true);
    setShowQuickSelect(false);
  };

  const toggleNotifications = async () => {
    if (showNotifications) {
      setShowNotifications(false);
      return;
    }
    setShowNotifications(true);
    setAnnouncementsLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_get_dashboard_api.php"), { credentials: "include" });
      const json = await res.json();
      setAnnouncements(json?.success && Array.isArray(json?.data) ? json.data : []);
    } catch {
      setAnnouncements([]);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  const switchCompany = async (nextCompanyId) => {
    if (!nextCompanyId || Number(nextCompanyId) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextCompanyId}`), { credentials: "include" });
      const json = await res.json();
      if (json?.success) {
        if (typeof window.updateSidebarDataCaptureVisibility === "function" && json?.data) {
          window.updateSidebarDataCaptureVisibility(json.data.has_gambling, json.data.has_bank);
        }
        setCompanyId(Number(nextCompanyId));
        setMe((prev) => (prev ? { ...prev, company_id: Number(nextCompanyId) } : prev));
        showNotification(`Switched to company ${nextCompanyId}`, "success");
      }
    } catch {
      showNotification("Failed to switch company", "error");
    }
  };

  const switchAccount = async (nextAccountId) => {
    if (!nextAccountId || Number(nextAccountId) === Number(accountId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_account_session_api.php?account_id=${nextAccountId}`), { credentials: "include" });
      const json = await res.json();
      if (json?.success) {
        setAccountId(Number(json?.data?.account_id || nextAccountId));
        showNotification(`Switched to account ${json?.data?.account_code || nextAccountId}`, "success");
      }
    } catch {
      showNotification("Failed to switch account", "error");
    }
  };

  const persistCurrencyOrder = async (nextOrder) => {
    try {
      const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: nextOrder }),
      });
      const json = await res.json();
      if (json?.success) {
        setCurrencyOrder(Array.isArray(json?.data?.order) ? json.data.order : nextOrder);
        setIsAllSelected(true);
        setSelectedCurrencies([]);
        showNotification("Currency order saved", "success");
      }
    } catch {
      showNotification("Failed to save currency order", "error");
    }
  };

  const performLogout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await fetch(buildApiUrl("api/session/logout_api.php"), { method: "POST", credentials: "include" });
    } finally {
      setLogoutLoading(false);
      setShowLogoutConfirm(false);
      navigate("/login", { replace: true });
    }
  };

  if (loading || !me) return null;
  const roleLabel = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1).toLowerCase() : "Member";

  return (
    <>
      <div className="informationmenu-overlay" style={{ display: "none" }} />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src={assetUrl("images/count_whitelogo.png")} alt="EAZYCOUNT Logo" className="header-logo" />
            <div className="notification-bell" title="Notifications" onClick={toggleNotifications}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
              </svg>
            </div>
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container" ref={avatarContainerRef}>
              <div className="current-avatar" onClick={() => setShowAvatarOptions((prev) => !prev)}>
                <img id="currentAvatarImg" className="current-avatar-img" src={avatarSrc} alt="Avatar" />
              </div>
              <div className={`avatar-options ${showAvatarOptions ? "show" : ""}`} id="avatarOptions">
                <div className="options-title">Choose Avatar</div>
                <div className="gender-selection">
                  <button type="button" className={`gender-btn ${selectedGender === "male" ? "active" : ""}`} onClick={() => setSelectedGender("male")}>Male</button>
                  <button type="button" className={`gender-btn ${selectedGender === "female" ? "active" : ""}`} onClick={() => setSelectedGender("female")}>Female</button>
                </div>
                <div className={`avatar-list ${selectedGender === "male" ? "show" : ""}`}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <div key={`male-${num}`} className={`avatar-option ${selectedAvatarId === `male${num}` ? "selected" : ""}`} onClick={() => handleSelectAvatar(`male${num}`)}>
                      <img src={assetUrl(`images/avatar${num}.png`)} alt={`Male Avatar ${num}`} className="avatar-option-img" />
                    </div>
                  ))}
                </div>
                <div className={`avatar-list ${selectedGender === "female" ? "show" : ""}`}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <div key={`female-${num}`} className={`avatar-option ${selectedAvatarId === `female${num}` ? "selected" : ""}`} onClick={() => handleSelectAvatar(`female${num}`)}>
                      <img src={assetUrl(`images/female${num}.png`)} alt={`Female Avatar ${num}`} className="avatar-option-img" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="user-avatar-dropdown">
              <div className="user-info">
                <div className="user-name">{me.login_id || "-"}</div>
                <div className="user-role">{roleLabel}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="informationmenu-content">
          <div className="content-separator" />
          <div className="informationmenu-section">
            <div className="informationmenu-section-title current-page">Win/Loss</div>
          </div>
        </div>
        <div className="informationmenu-footer">
          <div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}>
            <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">Exp:</span>
              <span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>{me?.expiration_hint || "-"}</span>
            </div>
          </div>
          <button className="btn logout-btn" onClick={() => setShowLogoutConfirm(true)} type="button">Logout</button>
        </div>
      </div>

      <div className="transaction-container">
        <h1 className="transaction-title">Win/Loss</h1>
        <div className="transaction-main-content">
          <div className="transaction-search-section" style={{ flex: 1 }}>
            <div className="transaction-form-group transaction-capture-date-group">
              <label className="transaction-label transaction-date-range-label">Capture Date</label>
              <div className="transaction-capture-date-row">
                <div className="transaction-date-range-wrap" id="capture_date_range_wrap">
                  <i className="fas fa-calendar-alt" aria-hidden="true" />
                  <input ref={dateRangeInputRef} type="text" id="capture_date_range" className="transaction-input transaction-date-range-input" defaultValue={`${dateFrom} - ${dateTo}`} placeholder="Select date range" readOnly style={{ cursor: "pointer" }} />
                </div>
                <div className="transaction-quick-select-wrap">
                  <div className="dropdown transaction-quick-select-dropdown" ref={quickSelectRef}>
                    <button
                      type="button"
                      className="btn btn-secondary dropdown-toggle transaction-quick-select-btn"
                      onClick={() => setShowQuickSelect((prev) => !prev)}
                    >
                      <i className="fas fa-calendar-alt" />
                      <span id="quick-select-text">{quickRangeLabel}</span>
                      <i className="fas fa-chevron-down" />
                    </button>
                    <div className={`dropdown-menu${showQuickSelect ? " show" : ""}`} id="quick-select-dropdown">
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("today")}>Today</button>
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("yesterday")}>Yesterday</button>
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("thisWeek")}>This Week</button>
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("lastWeek")}>Last Week</button>
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("thisMonth")}>This Month</button>
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("lastMonth")}>Last Month</button>
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("thisYear")}>This Year</button>
                      <button type="button" className="dropdown-item" onClick={() => applyQuickRange("lastYear")}>Last Year</button>
                    </div>
                  </div>
                </div>
              </div>
              <input type="hidden" id="date_from" value={dateFrom} readOnly />
              <input type="hidden" id="date_to" value={dateTo} readOnly />
            </div>
            {companies.length > 1 && (
              <div className="member-company-filter" id="member_company_filter" style={{ display: "flex", visibility: "visible" }}>
                <span className="transaction-company-label">Company:</span>
                <div id="member_company_buttons" className="transaction-company-buttons member-currency-buttons">
                  {companies.map((company) => (
                    <button key={company.id} type="button" className={`transaction-company-btn ${Number(company.company_id) === Number(companyId) ? "active" : ""}`} onClick={() => switchCompany(company.company_id)}>
                      {String(company.company_code || "").toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="member-account-filter transaction-company-filter" id="member_account_filter" style={{ display: linkedAccounts.length > 1 ? "flex" : "none" }}>
              <span className="transaction-company-label">Account:</span>
              <div id="member_account_buttons" className="transaction-company-buttons member-currency-buttons">
                {linkedAccounts.map((acc) => (
                  <button key={acc.id} type="button" className={`transaction-company-btn ${Number(acc.id) === Number(accountId) ? "active" : ""}`} onClick={() => switchAccount(acc.id)}>
                    {String(acc.account_id || acc.name || acc.id)}
                  </button>
                ))}
              </div>
            </div>
            <div className="transaction-company-filter member-currency-filter" id="member_currency_filter" style={{ display: "flex", visibility: "visible" }}>
              <span className="transaction-company-label">Currency:</span>
              <div id="member_currency_buttons" className="transaction-company-buttons member-currency-buttons">
                {availableCurrencies.length > 0 && (
                  <button
                    type="button"
                    className={`transaction-company-btn member-currency-all ${isAllSelected ? "active" : ""}`}
                    onClick={() => {
                      if (isAllSelected) return;
                      setIsAllSelected(true);
                      setSelectedCurrencies([]);
                    }}
                  >
                    All
                  </button>
                )}
                {availableCurrencies.map((code, index) => (
                  <button
                    key={code}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", code)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragged = e.dataTransfer.getData("text/plain");
                      if (!dragged || dragged === code) return;
                      const from = availableCurrencies.indexOf(dragged);
                      const to = index;
                      if (from < 0 || to < 0) return;
                      const next = [...availableCurrencies];
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      setCurrencyOrder(next);
                      persistCurrencyOrder(next);
                    }}
                    className={`transaction-company-btn ${selectedCurrencies.includes(code) ? "active" : ""}`}
                    onClick={() => {
                      setIsAllSelected(false);
                      setSelectedCurrencies((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
                    }}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="member-currency-section" id="member_currency_tables_section" style={{ display: "flex", visibility: "visible" }}>
          <div id="member_currency_tables" className="member-currency-tables">
            {loadingTable ? (
              <p className="member-currency-empty" style={{ margin: 0 }}>Loading...</p>
            ) : groupedRows.length === 0 && !isAllSelected ? (
              <p className="member-currency-empty" style={{ margin: 0 }}>Please select currency</p>
            ) : groupedRows.length === 0 ? (
              <p className="member-currency-empty" style={{ margin: 0 }}>No data in the selected date range.</p>
            ) : (
              groupedRows.map(([currency, rows]) => {
                const totalWinLossCents = rows.reduce((sum, r) => sum + parseMoneyToCents(r.win_loss), 0);
                const totalCrDrCents = rows.reduce((sum, r) => sum + parseMoneyToCents(r.cr_dr), 0);
                const closingCents = rows.length ? parseMoneyToCents(rows[rows.length - 1].balance) : 0;
                return (
                  <div className="member-currency-table-wrapper" key={currency}>
                    <h3 className="member-currency-table-title">{`Currency: ${currency}`}</h3>
                    <table className="transaction-table member-winloss-table">
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
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr className="transaction-table-row"><td colSpan={9} style={{ textAlign: "center" }}>No data</td></tr>
                        ) : (
                          rows.map((row, idx) => (
                            <tr className={`transaction-table-row ${row.row_type === "bf" ? "member-bf-row" : ""}`} key={`${currency}-${idx}`}>
                              <td className="transaction-history-col-date">{row.date || "-"}</td>
                              <td className="transaction-history-col-product">{row.is_bank_process_transaction ? row.card_owner || "-" : row.product || "-"}</td>
                              <td className="transaction-history-col-currency">{row.currency || "-"}</td>
                              <td className="transaction-history-col-rate">{row.rate || "-"}</td>
                              <td className="transaction-history-col-winloss">{formatHistoryMoney(row.win_loss)}</td>
                              <td className="transaction-history-col-crdr">{formatHistoryMoney(row.cr_dr)}</td>
                              <td className="transaction-history-col-balance">{formatHistoryMoney(row.balance)}</td>
                              <td className="transaction-history-col-description">{row.description || "-"}</td>
                              <td className="transaction-history-col-remark text-uppercase">{(row.remark || row.sms || "-").toUpperCase()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="transaction-table-row transaction-summary-total">
                          <td className="transaction-summary-total-label">{`Total (${currency})`}</td>
                          <td className="transaction-history-col-product">-</td>
                          <td className="transaction-history-col-currency">-</td>
                          <td className="transaction-history-col-rate">-</td>
                          <td className="transaction-history-col-winloss">{formatHistoryMoney((totalWinLossCents / 100).toFixed(2))}</td>
                          <td className="transaction-history-col-crdr">{formatHistoryMoney((totalCrDrCents / 100).toFixed(2))}</td>
                          <td className="transaction-history-col-balance">{formatHistoryMoney((closingCents / 100).toFixed(2))}</td>
                          <td className="transaction-history-col-description">-</td>
                          <td className="transaction-history-col-remark">-</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div id="notificationContainer" className="transaction-notification-container">
          {notifications.map((note) => (
            <div
              key={note.id}
              className={`transaction-notification ${
                note.type === "error"
                  ? "transaction-notification-error"
                  : note.type === "warning"
                    ? "transaction-notification-warning"
                    : "transaction-notification-success"
              } show`}
            >
              {note.message}
            </div>
          ))}
        </div>
      </div>

      <div className={`notification-overlay ${showNotifications ? "show" : ""}`} onClick={toggleNotifications} />
      <div className={`notification-panel ${showNotifications ? "show" : ""}`}>
        <div className="notification-header">
          <h2>Announcements</h2>
          <button className="notification-close" onClick={toggleNotifications} title="Close" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="notification-content">
          {announcementsLoading ? (
            <div className="notification-empty"><p>Loading announcements...</p></div>
          ) : announcements.length > 0 ? (
            announcements.map((a, idx) => (
              <div key={`${a.title || "announcement"}-${idx}`} className="notification-item unread">
                <div className="notification-title">{a.title}</div>
                <div className="notification-message">{a.content}</div>
                <div className="notification-time">{a.created_at}</div>
              </div>
            ))
          ) : (
            <div className="notification-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
              <p>No announcements</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmLogoutModal
        open={showLogoutConfirm}
        loading={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={performLogout}
      />
    </>
  );
}
