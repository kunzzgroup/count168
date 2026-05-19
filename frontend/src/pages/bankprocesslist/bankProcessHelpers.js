import { MoneyDecimal } from "../../utils/moneyDecimal.js";

export const PAGE_SIZE = 20;

/** Bank Process 金额：固定两位小数（如 300.00） */
export function isValidBankMoneyInput(value) {
  try {
    MoneyDecimal.toDecimal(value);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeBankMoneyTyping(value) {
  return String(value ?? "").replace(/,/g, "");
}

export function formatBankMoneyFixed2(value, { emptyAsZero = true } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return emptyAsZero ? "0.00" : "";
  if (!isValidBankMoneyInput(raw)) return emptyAsZero ? "0.00" : "";
  return MoneyDecimal.formatFixedHalfUp(raw, 2);
}

/** Profit = max(0, sell - buy - sum(profit sharing))，展示两位小数；全无输入时为空 */
export function calcBankNetProfitDisplay(cost, price, profitSharingStr) {
  const costStr = String(cost ?? "").trim();
  const priceStr = String(price ?? "").trim();
  const psStr = String(profitSharingStr ?? "").trim();
  if (!costStr && !priceStr && !psStr) return "";

  const costDec = isValidBankMoneyInput(cost) ? MoneyDecimal.toDecimal(cost, 0) : MoneyDecimal.toDecimal("0", 0);
  const priceDec = isValidBankMoneyInput(price) ? MoneyDecimal.toDecimal(price, 0) : MoneyDecimal.toDecimal("0", 0);
  let shareDec = MoneyDecimal.toDecimal("0", 0);
  const str = String(profitSharingStr || "").trim();
  if (str) {
    for (const part of str.split(",")) {
      const t = part.trim();
      const dash = t.lastIndexOf(" - ");
      if (dash === -1) continue;
      const amt = t.slice(dash + 3).trim();
      if (isValidBankMoneyInput(amt)) {
        shareDec = shareDec.plus(MoneyDecimal.toDecimal(amt, 0));
      }
    }
  }
  const net = MoneyDecimal.max(MoneyDecimal.sub(priceDec, costDec).minus(shareDec), "0");
  return formatBankMoneyFixed2(net.toString());
}

export function formatProfitSharingStringFixed2(s) {
  const str = String(s || "").trim();
  if (!str) return "";
  return str
    .split(",")
    .map((part) => {
      const t = part.trim();
      const dash = t.lastIndexOf(" - ");
      if (dash === -1) return t;
      const label = t.slice(0, dash).trim();
      const amt = formatBankMoneyFixed2(t.slice(dash + 3).trim());
      return label ? `${label} - ${amt}` : null;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Bank Process 账户下拉（Supplier / Customer / Company / Profit sharing）允许的 role。
 * 与 js/bank_process_list.js BANK_ALLOWED_ACCOUNT_ROLES 一致。
 *
 * 会出现在 option 中：PARTNER, SUPPLIER, UPLINE（供应商）, STAFF, AGENT, MEMBER, PROFIT
 * 不会出现在 option 中（被 role 筛掉）：CAPITAL, BANK, CASH, EXPENSES, COMPANY, DEBTOR 等未列出的 role
 *
 * 另需 status === active；inactive 账户不会出现在 option 中。
 */
export const BANK_PICK_ACCOUNT_ROLES = ["PARTNER", "SUPPLIER", "UPLINE", "STAFF", "AGENT", "MEMBER", "PROFIT"];

export function normalizeBankPickAccountRole(role) {
  return String(role || "").trim().toUpperCase();
}

export function isAllowedBankPickAccountRole(role) {
  return BANK_PICK_ACCOUNT_ROLES.includes(normalizeBankPickAccountRole(role));
}

export function isActiveBankPickAccount(account) {
  return String(account?.status || "").trim().toLowerCase() === "active";
}

/** Supplier / Customer / Company / Profit sharing 下拉仅展示 active 且 role 在允许列表内的账户 */
export function filterBankPickAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.filter((a) => isActiveBankPickAccount(a) && isAllowedBankPickAccountRole(a.role));
}

/** Matches legacy bank_process_list.js formatBankAccountDisplay */
export function formatBankAccountDisplay(codeRaw, nameRaw, fallbackRaw) {
  const code = String(codeRaw || "").trim();
  const name = String(nameRaw || "").trim();
  const fallback = String(fallbackRaw || "").trim();
  if (code) {
    const safeName = name || code;
    return `${code} [${safeName}]`;
  }
  if (name) return name;
  return fallback;
}

/** 与旧版 bank_process_list.js BANK_GRID_TEMPLATE_COLUMNS 一致，保证列宽对齐 */
export const BANK_GRID_TEMPLATE_COLUMNS =
  "minmax(26px,0.12fr) minmax(46px,0.38fr) minmax(32px,0.20fr) minmax(42px,0.36fr) minmax(48px,0.28fr) minmax(0,0.78fr) minmax(0,0.56fr) minmax(0,0.44fr) minmax(0,0.48fr) minmax(52px,0.26fr) minmax(52px,0.26fr) minmax(52px,0.26fr) minmax(0,0.42fr) minmax(0,0.4fr) minmax(72px,0.34fr)";

/** Action 与批量勾选分两列（与 User List / Games Process 一致） */
export const BANK_GRID_TEMPLATE_COLUMNS_WITH_SELECT =
  "minmax(26px,0.12fr) minmax(46px,0.38fr) minmax(32px,0.20fr) minmax(42px,0.36fr) minmax(48px,0.28fr) minmax(0,0.78fr) minmax(0,0.56fr) minmax(0,0.44fr) minmax(0,0.48fr) minmax(52px,0.26fr) minmax(52px,0.26fr) minmax(52px,0.26fr) minmax(0,0.42fr) minmax(0,0.4fr) minmax(0,0.3fr) 48px";

export function normalizeRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const normalizedType = String(row?.type || row?.types || "").trim();
    const normalizedStatus = normalizeBankProcessStatus(row?.status);
    const normalizedIssueFlag = normalizeBankIssueFlag(row?.issue_flag);
    return {
      ...row,
      type: normalizedType,
      status: normalizedStatus,
      issue_flag: normalizedIssueFlag,
    };
  });
}

export function normalizeBankIssueFlag(v) {
  const s = String(v || "").trim().toLowerCase().replace(/-/g, "_");
  if (!s) return "";
  if (s.includes("e_invoice") || s.includes("einvoice") || s.includes("e invoice")) return "e_invoice";
  if (s.includes("official")) return "official";
  if (s.includes("block")) return "block";
  return "";
}

export function normalizeBankProcessStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "active";
  if (s.includes("inactive")) return "inactive";
  if (s.includes("waiting")) return "waiting";
  if (s.includes("active")) return "active";
  return "active";
}

export function isBankInactiveLike(status, issueFlag) {
  const s = normalizeBankProcessStatus(status);
  const f = normalizeBankIssueFlag(issueFlag);
  return s === "inactive" || f === "official" || f === "e_invoice" || f === "block";
}

/**
 * Bank list client-side row filter (legacy bank_process_list.js matchesCurrentBankFilters).
 * - showAll: keep everything (date-range still applied by caller)
 * - any of showInactive/showOfficial/showEInvoice/showBlock: union of those exact buckets
 * - none: only "default visible" rows = active AND issue_flag NOT IN (official, e_invoice, block)
 *
 * "Plain inactive" means status==='inactive' AND issue_flag NOT IN (official, e_invoice, block).
 */
export function matchesCurrentBankFilters(row, filters) {
  if (!row) return false;
  const { showAll, showInactive, showOfficial, showEInvoice, showBlock } = filters || {};
  if (showAll) return true;
  const status = normalizeBankProcessStatus(row.status);
  const issueFlag = normalizeBankIssueFlag(row.issue_flag);
  const isPlainInactive =
    status === "inactive" && issueFlag !== "official" && issueFlag !== "e_invoice" && issueFlag !== "block";
  const matches = [];
  if (showInactive) matches.push(isPlainInactive);
  if (showOfficial) matches.push(issueFlag === "official");
  if (showEInvoice) matches.push(issueFlag === "e_invoice");
  if (showBlock) matches.push(issueFlag === "block");
  if (matches.length === 0) {
    return (
      status === "active" && issueFlag !== "official" && issueFlag !== "e_invoice" && issueFlag !== "block"
    );
  }
  return matches.some(Boolean);
}

export function canShowBankResend(row) {
  const s = normalizeBankProcessStatus(row?.status);
  return s === "active" && !isBankInactiveLike(row?.status, row?.issue_flag);
}

export function isoToDmy(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) return "";
  const [y, m, d] = String(iso).trim().split("-");
  return `${d}/${m}/${y}`;
}

export function dmyToIso(dmy) {
  const t = String(dmy || "").trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return "";
  const p = t.split("/");
  const dd = parseInt(p[0], 10);
  const mm = parseInt(p[1], 10);
  const yy = parseInt(p[2], 10);
  if (!yy || !mm || !dd) return "";
  return `${String(yy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function parseRowDateMs(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const head = s.slice(0, 10);
    const t = new Date(`${head}T00:00:00`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [dd, mm, yy] = s.split("/").map((x) => Number(x, 10));
    const t = new Date(yy, mm - 1, dd).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export function isBankResendDayStartBackendErrorMessage(text) {
  const s = String(text || "");
  return (
    s.includes("不可与今天相同") ||
    s.includes("Day start cannot be today") ||
    s.includes("Resend 所填 Day start") ||
    s.includes("same calendar date as the current contract Day start")
  );
}

export function notifyTransactionDataChanged(sourceTag) {
  const ts = String(Date.now());
  try {
    localStorage.setItem("count168_tx_invalidate_ts", ts);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("tx-data-changed", { detail: { ts, source: sourceTag || "bank-process-list-react" } }));
  } catch {
    /* ignore */
  }
}

const bankCategoryCompanyCache = new Map();

export async function isBankCategoryCompany(companyCode, buildApiUrl) {
  const cacheKey = String(companyCode || "").trim().toUpperCase();
  if (!cacheKey) return false;
  if (bankCategoryCompanyCache.has(cacheKey)) return bankCategoryCompanyCache.get(cacheKey);
  try {
    const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const json = await res.json();
    const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions : [];
    const normalized = permissions.map((p) => String(p || "").toLowerCase());
    const isBankOnly = normalized.includes("bank") && !normalized.includes("games") && !normalized.includes("gambling");
    bankCategoryCompanyCache.set(cacheKey, isBankOnly);
    return isBankOnly;
  } catch {
    return false;
  }
}

export function profitSharingTotalFromString(s) {
  let total = 0;
  const str = String(s || "").trim();
  if (!str) return 0;
  for (const part of str.split(",")) {
    const t = part.trim();
    const dash = t.lastIndexOf(" - ");
    if (dash === -1) continue;
    const n = parseFloat(t.slice(dash + 3).trim());
    if (!Number.isNaN(n)) total += n;
  }
  return total;
}

export function parseProfitSharingToRows(s, accounts) {
  const out = [];
  const str = String(s || "").trim();
  if (!str) return out;
  for (const part of str.split(",")) {
    const t = part.trim();
    const dash = t.lastIndexOf(" - ");
    if (dash === -1) continue;
    const label = t.slice(0, dash).trim();
    const amount = parseFloat(t.slice(dash + 3).trim());
    if (!label || Number.isNaN(amount)) continue;
    const acc = (accounts || []).find(
      (a) => String(a.account_id || "").toLowerCase() === label.toLowerCase() || String(a.name || "").toLowerCase() === label.toLowerCase()
    );
    out.push({
      accountId: acc ? String(acc.id) : "",
      accountLabel: label,
      amount: formatBankMoneyFixed2(String(amount)),
    });
  }
  return out;
}

export function serializeProfitSharingRows(rows, accounts) {
  return rows
    .map((r) => {
      const acc = (accounts || []).find((a) => String(a.id) === String(r.accountId));
      const label = (acc?.account_id || String(r.accountLabel || "").trim()).trim();
      const rawAmt = String(r.amount ?? "").trim();
      if (!label || !rawAmt || !isValidBankMoneyInput(rawAmt)) return null;
      const amt = formatBankMoneyFixed2(rawAmt);
      if (MoneyDecimal.cmp(amt, "0") <= 0) return null;
      return `${label} - ${amt}`;
    })
    .filter(Boolean)
    .join(", ");
}

export function deriveBankProcessUiStatus(row) {
  const f = normalizeBankIssueFlag(row?.issue_flag);
  if (f === "official") return "OFFICIAL";
  if (f === "e_invoice") return "E_INVOICE";
  if (f === "block") return "BLOCK";
  const s = normalizeBankProcessStatus(row?.status);
  if (s === "inactive") return "INACTIVE";
  if (s === "waiting") return "ACTIVE";
  return "ACTIVE";
}

export const EMPTY_BANK_FORM = {
  id: "",
  country: "",
  bank: "",
  type: "",
  name: "",
  card_merchant_id: "",
  customer_id: "",
  profit_account_id: "",
  contract: "",
  insurance: "",
  cost: "",
  price: "",
  profit: "",
  profit_sharing: "",
  day_start: "",
  day_end: "",
  /** Add Process: default Frequency = 1st of Every Month (edit uses saved `day_start_frequency`, including `once`). */
  day_start_frequency: "1st_of_every_month",
  status: "active",
  remark: "",
  sop: "",
};

/** @returns {'monthly'|'once'|'1st_of_every_month'} */
export function bankProcessFrequencyNormalized(v) {
  if (v === "monthly") return "monthly";
  if (v === "once") return "once";
  return "1st_of_every_month";
}

/** Contract dropdown values (stored/sent to API unchanged). */
export const BANK_PROCESS_CONTRACT_OPTIONS = [
  { value: "1 MONTH" },
  { value: "2 MONTHS" },
  { value: "3 MONTHS" },
  { value: "6 MONTHS" },
  { value: "1+1" },
  { value: "1+2" },
  { value: "1+3" },
];

const BANK_PROCESS_CONTRACT_CANONICAL = {
  "1": "1 MONTH",
  "1 month": "1 MONTH",
  "2": "2 MONTHS",
  "2 months": "2 MONTHS",
  "3": "3 MONTHS",
  "3 months": "3 MONTHS",
  "6": "6 MONTHS",
  "6 months": "6 MONTHS",
  "1+1": "1+1",
  "1+1 month": "1+1",
  "1+2": "1+2",
  "1+2 months": "1+2",
  "1+3": "1+3",
  "1+3 months": "1+3",
};

const BANK_PROCESS_CONTRACT_LABEL_EN = {
  "1 MONTH": "1 MONTH",
  "2 MONTHS": "2 MONTHS",
  "3 MONTHS": "3 MONTHS",
  "6 MONTHS": "6 MONTHS",
  "1+1": "1+1 MONTH",
  "1+2": "1+2 MONTHS",
  "1+3": "1+3 MONTHS",
};

const BANK_PROCESS_CONTRACT_LABEL_ZH = {
  "1 MONTH": "1个月",
  "2 MONTHS": "2个月",
  "3 MONTHS": "3个月",
  "6 MONTHS": "6个月",
  "1+1": "1+1个月",
  "1+2": "1+2个月",
  "1+3": "1+3个月",
};

export function normalizeBankProcessContractKey(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const mapped = BANK_PROCESS_CONTRACT_CANONICAL[text.toLowerCase()];
  if (mapped) return mapped;
  const plusMonth = text.match(/^1\+(\d+)\s+MONTHS?$/i);
  if (plusMonth) return `1+${plusMonth[1]}`;
  if (/^1\+\d+$/i.test(text)) return text.toUpperCase();
  return text;
}

/** UI label for contract pill / select (zh: MONTH → 个月). */
export function formatBankProcessContractLabel(lang, raw) {
  const key = normalizeBankProcessContractKey(raw);
  if (!key) return "";
  if (lang === "zh") {
    return BANK_PROCESS_CONTRACT_LABEL_ZH[key] || String(raw).trim().replace(/\s*MONTHS?\b/gi, "个月");
  }
  return BANK_PROCESS_CONTRACT_LABEL_EN[key] || key;
}

/** English display key for contract badge CSS (gray 1-month variants). */
export function bankProcessContractBadgeKey(raw) {
  const key = normalizeBankProcessContractKey(raw);
  return BANK_PROCESS_CONTRACT_LABEL_EN[key] || key;
}

export const parseBankContractTermMonths = (contract) => {
  if (!contract || String(contract).trim() === '') return null;
  const c = String(contract).trim();
  let m = c.match(/^1\+(\d+)$/i);
  if (m) return 1 + parseInt(m[1], 10);
  m = c.match(/^(\d+)\s*MONTHS?$/i);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return null;
};

export const addCalendarMonthsToYmd = (ymd, months) => {
  if (!ymd || months == null || months < 1) return null;
  const p = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!p) return null;
  const d = new Date(parseInt(p[1], 10), parseInt(p[2], 10) - 1, parseInt(p[3], 10));
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
};

export const billingContractExclusiveEndYmdFirstOfMonthJs = (startYmd, termMonths) => {
  if (!startYmd || termMonths < 1) return null;
  const p = String(startYmd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!p) return null;
  const y = parseInt(p[1], 10);
  const mo = parseInt(p[2], 10);
  const day = parseInt(p[3], 10);
  const start = new Date(y, mo - 1, day);
  if (isNaN(start.getTime())) return null;
  if (day === 1) {
    start.setMonth(start.getMonth() + termMonths);
  } else {
    const firstAnchor = new Date(y, mo, 1);
    firstAnchor.setMonth(firstAnchor.getMonth() + (termMonths - 1));
    return `${firstAnchor.getFullYear()}-${String(firstAnchor.getMonth() + 1).padStart(2, '0')}-${String(firstAnchor.getDate()).padStart(2, '0')}`;
  }
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
};

export const contractBillingEndYmdForBankForm = (startYmd, termMonths, frequency) => {
  if (!startYmd || termMonths == null || termMonths < 1) return null;
  if (frequency === "once") return null;
  if (frequency === 'monthly') return addCalendarMonthsToYmd(startYmd, termMonths);
  return billingContractExclusiveEndYmdFirstOfMonthJs(startYmd, termMonths);
};
