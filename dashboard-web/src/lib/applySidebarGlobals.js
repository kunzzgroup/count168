/**
 * 将 PHP 注入的 __SIDEBAR_BOOTSTRAP 同步到 window.SIDEBAR_*，供 js/sidebar.js 使用。
 */
export function applySidebarGlobals(b) {
  if (!b || typeof b !== 'object') return
  window.SIDEBAR_IS_MEMBER = !!b.isMember
  window.SIDEBAR_EXPIRATION_DATE = b.company_expiration_date ? String(b.company_expiration_date) : ''
  window.SIDEBAR_COMPANY_HAS_GAMBLING = !!b.companyHasGambling
  window.SIDEBAR_COMPANY_HAS_BANK = !!b.companyHasBank
  window.SIDEBAR_COMPANY_CODE = b.currentCompanyCode != null ? String(b.currentCompanyCode) : ''
  window.isExternalView = !!b.isExternalView
}
