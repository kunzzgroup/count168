/** Account List Logic Helpers */

export const PAGE_SIZE = 20;

export const ROLE_PRIORITY = ["CAPITAL", "BANK", "CASH", "PROFIT", "EXPENSES", "COMPANY", "PARTNER", "STAFF", "SUPPLIER", "AGENT", "MEMBER", "DEBTOR"];

export const DEFAULT_FORM = {
  id: "",
  account_id: "",
  name: "",
  role: "",
  password: "",
  remark: "",
  payment_alert: "0",
  alert_type: "",
  alert_start_date: "",
  alert_amount: "",
};

export function toUpper(v) {
  return String(v || "").toUpperCase();
}

export function normalizeAlertAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (Number.isNaN(num)) return "";
  if (num > 0) return `-${num}`;
  return String(num);
}

export function roleSortOrder(role, knownRoles) {
  const base = [...ROLE_PRIORITY];
  (knownRoles || []).forEach((r) => {
    const key = toUpper(r) === "UPLINE" ? "SUPPLIER" : toUpper(r);
    if (!base.includes(key)) base.push(key);
  });
  return base.indexOf(toUpper(role) === "UPLINE" ? "SUPPLIER" : toUpper(role));
}

export function getOrderedRoles(roles) {
  const map = new Map();
  (roles || []).forEach((r) => {
    const t = String(r || "").trim();
    if (t) map.set(toUpper(t), t);
  });
  ["PARTNER", "STAFF", "DEBTOR"].forEach((r) => {
    if (!map.has(r)) map.set(r, r);
  });
  const out = [];
  ROLE_PRIORITY.forEach((p) => {
    if (map.has(p)) {
      out.push(map.get(p));
      map.delete(p);
    } else if (p === "SUPPLIER" && map.has("UPLINE")) {
      out.push(map.get("UPLINE"));
      map.delete("UPLINE");
    }
  });
  return [...out, ...Array.from(map.values()).sort((a, b) => a.localeCompare(b))];
}
