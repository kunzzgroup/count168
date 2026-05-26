import { buildApiUrl } from "../core/apiUrl.js";
import { notifyCompanySessionUpdated } from "./companySessionEvents.js";

export async function syncCompanySessionApi(companyId) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return { success: false };
  try {
    const response = await fetch(
      buildApiUrl(`api/session/update_company_session_api.php?company_id=${id}`),
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
