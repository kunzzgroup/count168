import { rememberCompanySessionFlags } from "./companySessionFlagsCache.js";

/**
 * Call after `update_company_session_api.php` succeeds so AuthenticatedLayout
 * can patch sidebar flags immediately (without waiting for current_user_api).
 */
/** @param {object|null} [sessionData] — payload from update_company_session_api.php `data` */
export function notifyCompanySessionUpdated(sessionData = null) {
  if (sessionData && typeof sessionData === "object") {
    rememberCompanySessionFlags(sessionData);
  }
  window.dispatchEvent(
    new CustomEvent("eazycount:company-session-updated", { detail: sessionData ?? null })
  );
}
