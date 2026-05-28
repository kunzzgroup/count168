import { buildApiUrl } from "../core/apiUrl.js";
import { notifyCompanySessionUpdated } from "./companySessionEvents.js";

export async function syncCompanySessionApi(companyId, viewGroup = null) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return { success: false };
  try {
    const q = new URLSearchParams({ company_id: String(id) });
    const vg = viewGroup ? String(viewGroup).trim() : "";
    if (vg) q.set("view_group", vg);
    const response = await fetch(
      buildApiUrl(`api/session/update_company_session_api.php?${q.toString()}`),
      { credentials: "include" }
    );
    return await response.json();
  } catch {
    return { success: false };
  }
}

export async function syncCompanySessionAndNotify(companyId) {
  const json = await syncCompanySessionApi(companyId);
  if (json?.success) notifyCompanySessionUpdated();
  return json;
}
