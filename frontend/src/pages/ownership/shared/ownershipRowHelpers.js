/** Shared ownership row edit / validate helpers (company + group tabs). */

export function isExternalPartnerRow(row) {
  return row?.is_external_partner === true;
}

export function allocationRowsForSave(rows) {
  return (rows || []).filter((r) => !isExternalPartnerRow(r));
}

export function rowsToSavePayload(rows) {
  return (rows || []).map((r, sort_order) => ({
    account_id: r.account_id,
    percentage: r.percentage,
    read_only: r.read_only,
    is_external_partner: isExternalPartnerRow(r),
    sort_order,
  }));
}

export function mapOwnerApiRows(data) {
  return (Array.isArray(data) ? data : []).map((o) => ({
    account_id: o.account_id,
    account_label: o.account_name || o.name || String(o.account_id ?? ""),
    percentage: parseFloat(o.percentage),
    role: o.role || "",
    user_raw_id: o.user_raw_id || null,
    ownership_id: o.ownership_id || null,
    is_external_partner: parseInt(o.is_external_partner, 10) === 1,
    read_only: o.read_only !== null ? parseInt(o.read_only, 10) : 1,
  }));
}

export function accountsFromOwnerRows(rows) {
  return rows.map((r) => ({
    id: r.account_id,
    account_name: r.account_label || String(r.account_id),
    name: r.account_label || String(r.account_id),
    role: r.role || "",
  }));
}

export function calcOwnershipTotal(rows) {
  return rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);
}
export function fmtOwnershipPct(n) {
  return `${(parseFloat(n) || 0).toFixed(2)}%`;
}

export const EMPTY_OWNERSHIP_ROW = {
  account_id: "",
  percentage: 0,
  role: "",
  user_raw_id: null,
  read_only: 1,
};

export function applyOwnershipRowFieldUpdate(row, field, val, accounts) {
  const r = { ...row };
  if (field === "account_id") {
    r.account_id = val;
    const acc = accounts.find((a) => String(a.id) === String(val));
    if (acc) {
      r.role = (acc.role || "").toLowerCase();
      r.user_raw_id = String(val).startsWith("U_") ? parseInt(String(val).replace("U_", ""), 10) : null;
      r.read_only = 1;
      r.is_external_partner = false;
      r.ownership_id = null;
    } else {
      r.role = "";
      r.user_raw_id = null;
      r.is_external_partner = false;
      r.ownership_id = null;
    }
  } else if (field === "percent_input") {
    let p = parseFloat(String(val).replace("%", ""));
    if (isNaN(p)) p = 0;
    r.percentage = Math.max(0, Math.min(100, p));
  } else if (field === "slider") {
    r.percentage = parseFloat(val);
  } else if (field === "read_only") {
    r.read_only = val;
  }
  return r;
}

export function reorderOwnershipRows(rows, from, to, insertAfter) {
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  let newIdx = to;
  if (from < to) newIdx = insertAfter ? to : to - 1;
  else newIdx = insertAfter ? to + 1 : to;
  next.splice(newIdx, 0, moved);
  return next;
}

/**
 * @returns {string|null} Error message, or null if valid.
 */
export function validateOwnershipRowsForSave(rows, messages) {
  const alloc = allocationRowsForSave(rows);
  if (alloc.some((r) => !r.account_id)) return messages.emptyAccount;
  if (calcOwnershipTotal(alloc) > 100) return messages.over100;
  const ids = alloc.map((r) => r.account_id);
  if (new Set(ids).size !== ids.length) return messages.duplicate;
  return null;
}
