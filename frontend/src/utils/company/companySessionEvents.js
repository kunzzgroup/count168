/**
 * Call after `update_company_session_api.php` succeeds so AuthenticatedLayout
 * refetches `current_user_api.php` (Domain / Announcement visibility, company flags).
 */
/** @param {object|null} [sessionData] — payload from update_company_session_api.php `data` */
export function notifyCompanySessionUpdated(sessionData = null) {
  window.dispatchEvent(
    new CustomEvent("eazycount:company-session-updated", { detail: sessionData ?? null })
  );
}
