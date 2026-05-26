import { buildApiUrl } from "../../utils/core/apiUrl.js";

export const AUTO_RENEW_PERIODS = [
  { value: "7days", labelKey: "period7days" },
  { value: "1month", labelKey: "period1month" },
  { value: "3months", labelKey: "period3months" },
  { value: "6months", labelKey: "period6months" },
  { value: "1year", labelKey: "period1year" },
];

export async function fetchAutoRenewSettings() {
  const res = await fetch(buildApiUrl("api/subscription/auto_renew_api.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get" }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || "Failed to load auto renew settings");
  }
  return json.data;
}

export async function saveAutoRenewSettings({ autoRenewEnabled, autoRenewPeriod }) {
  const res = await fetch(buildApiUrl("api/subscription/auto_renew_api.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "update",
      auto_renew_enabled: autoRenewEnabled,
      auto_renew_period: autoRenewPeriod,
    }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || "Failed to save auto renew settings");
  }
  return json.data;
}
