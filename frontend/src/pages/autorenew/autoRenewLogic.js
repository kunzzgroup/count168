import { buildApiUrl } from "../../utils/core/apiUrl.js";

export const AUTO_RENEW_PERIODS = [
  { value: "7days", labelKey: "period7days" },
  { value: "1month", labelKey: "period1month" },
  { value: "3months", labelKey: "period3months" },
  { value: "6months", labelKey: "period6months" },
  { value: "1year", labelKey: "period1year" },
];

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

export async function fetchAutoRenewCompanies() {
  return postAutoRenew({ action: "list_companies" });
}

export async function fetchAutoRenewSettings(targetCompanyId) {
  return postAutoRenew({ action: "get", target_company_id: targetCompanyId });
}

export async function saveAutoRenewSettings({ targetCompanyId, autoRenewEnabled, autoRenewPeriod }) {
  return postAutoRenew({
    action: "update",
    target_company_id: targetCompanyId,
    auto_renew_enabled: autoRenewEnabled,
    auto_renew_period: autoRenewPeriod,
  });
}
