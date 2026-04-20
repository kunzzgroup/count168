/**
 * 与根目录 *.php 对应的路由表（Hash 路径，不含 #）。
 * migrated: true 表示已有 React 实现（或部分实现）。
 */

export const routeConfig = [
  { path: '/login', legacyFile: 'index.php', title: 'Login', migrated: true },
  { path: '/reset-password', legacyFile: 'reset-password.php', title: 'Reset password', migrated: false },
  {
    path: '/owner-secondary-password',
    legacyFile: 'owner_secondary_password.php',
    title: 'Owner secondary password',
    migrated: false
  },
  { path: '/dashboard', legacyFile: 'index.php', title: 'Transaction Dashboard', migrated: true },
  { path: '/member', legacyFile: 'index.php', title: 'Member', migrated: true },
  { path: '/account-list', legacyFile: 'account-list.php', title: 'Account list', migrated: false },
  { path: '/add-account', legacyFile: 'add-account.php', title: 'Add account', migrated: false },
  { path: '/announcement', legacyFile: 'announcement.php', title: 'Announcement', migrated: false },
  { path: '/bank-process-list', legacyFile: 'bank_process_list.php', title: 'Bank process list', migrated: false },
  { path: '/games-process-list', legacyFile: 'games_process_list.php', title: 'Games process list', migrated: false },
  { path: '/process-list', legacyFile: 'processlist.php', title: 'Process list', migrated: false },
  { path: '/bankprocess-maintenance', legacyFile: 'bankprocess_maintenance.php', title: 'Bank process maintenance', migrated: false },
  { path: '/capture-maintenance', legacyFile: 'capture_maintenance.php', title: 'Capture maintenance', migrated: false },
  { path: '/datacapture', legacyFile: 'datacapture.php', title: 'Data capture', migrated: false },
  { path: '/datacapture-summary', legacyFile: 'datacapturesummary.php', title: 'Data capture summary', migrated: false },
  { path: '/transaction', legacyFile: 'transaction.php', title: 'Transaction', migrated: false },
  { path: '/transaction-maintenance', legacyFile: 'transaction_maintenance.php', title: 'Transaction maintenance', migrated: false },
  { path: '/customer-report', legacyFile: 'customer_report.php', title: 'Customer report', migrated: false },
  { path: '/domain-report', legacyFile: 'domain_report.php', title: 'Domain report', migrated: false },
  { path: '/domain', legacyFile: 'domain.php', title: 'Domain', migrated: false },
  { path: '/formula-maintenance', legacyFile: 'formula_maintenance.php', title: 'Formula maintenance', migrated: false },
  { path: '/payment-maintenance', legacyFile: 'payment_maintenance.php', title: 'Payment maintenance', migrated: false },
  { path: '/ownership', legacyFile: 'ownership.php', title: 'Ownership', migrated: false },
  { path: '/permissions', legacyFile: 'permissions.php', title: 'Permissions', migrated: false },
  { path: '/user-access', legacyFile: 'useraccess.php', title: 'User access', migrated: false },
  { path: '/user-list', legacyFile: 'userlist.php', title: 'User list', migrated: false },
  { path: '/auto-monthly-accounting', legacyFile: 'auto_monthly_accounting.php', title: 'Auto monthly accounting', migrated: false },
  { path: '/check-php-config', legacyFile: 'check_php_config.php', title: 'PHP config (dev)', migrated: false },
  { path: '/debug-ag110', legacyFile: 'debug_ag110.php', title: 'Debug', migrated: false },
  { path: '/scratch-db', legacyFile: 'scratch_db.php', title: 'Scratch DB', migrated: false }
]

/** 仅后端/脚本入口，无独立 SPA 页，仅在文档中追踪 */
export const apiOnlyPhp = [
  'login_bootstrap.php',
  'getaccountapi.php',
  'domainapi.php',
  'roleapi.php',
  'session_check.php',
  'config.php',
  'db.php',
  'sidebar.php',
  'api/**/*.php',
  'includes/**/*.php'
]
