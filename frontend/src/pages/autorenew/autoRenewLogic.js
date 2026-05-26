import { buildApiUrl } from "../../utils/core/apiUrl.js";
import {
  TX_DATA_CHANGED_EVENT,
  TX_LIST_INVALIDATE_LS_KEY,
} from "../transaction/lib/transactionPaymentLogic.js";

export const AUTO_RENEW_PERIODS = [
  { value: "7days", labelKey: "period7days" },
  { value: "1month", labelKey: "period1month" },
  { value: "3months", labelKey: "period3months" },
  { value: "6months", labelKey: "period6months" },
  { value: "1year", labelKey: "period1year" },
];

export const AUTO_RENEW_STATUS_FILTERS = ["pending", "approved", "rejected", "all"];

async function postAutoRenew(body) {
  const res = await fetch(buildApiUrl("api/subscription/auto_renew_api.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || "Auto renew request failed");
  }
  return json.data;
}

export function invalidateTransactionListCache(source = "auto_renew") {
  const ts = String(Date.now());
  try {
    localStorage.setItem(TX_LIST_INVALIDATE_LS_KEY, ts);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent(TX_DATA_CHANGED_EVENT, { detail: { ts, source } }),
  );
}

export async function fetchAutoRenewApprovals(status = "pending", { dateFrom, dateTo } = {}) {
  const body = { action: "list", status };
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;
  return postAutoRenew(body);
}

export async function fetchAutoRenewPaymentHistory({ dateFrom, dateTo }) {
  return postAutoRenew({
    action: "payment_history",
    date_from: dateFrom || null,
    date_to: dateTo || null,
  });
}

export async function fetchAutoRenewStatusMap() {
  return postAutoRenew({ action: "status_map" });
}

export async function saveAutoRenewDraft({ requestId, period, fromAccountId, toAccountId }) {
  return postAutoRenew({
    action: "save_draft",
    request_id: requestId,
    period: period || null,
    from_account_id: fromAccountId || null,
    to_account_id: toAccountId || null,
  });
}

export async function approveAutoRenew({ requestId, period, fromAccountId, toAccountId }) {
  const result = await postAutoRenew({
    action: "approve",
    request_id: requestId,
    period,
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
  });
  invalidateTransactionListCache("auto_renew_approve");
  return result;
}

export async function rejectAutoRenew({ requestId }) {
  return postAutoRenew({
    action: "reject",
    request_id: requestId,
  });
}

export async function deleteAutoRenewApproval({ requestId }) {
  const result = await postAutoRenew({
    action: "delete",
    request_id: requestId,
  });
  invalidateTransactionListCache("auto_renew_delete");
  return result;
}
