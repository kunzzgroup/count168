-- Monthly ownership snapshots (save-on-confirm archives by calendar month).
-- Run once on production. Tables are also auto-created by api/includes/ownership_history.php.

-- Company ownership: one row per account per company per month (last save in month wins).
CREATE TABLE IF NOT EXISTS `company_ownership_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `effective_month` date NOT NULL COMMENT 'First day of month, e.g. 2026-03-01',
  `account_id` int(11) NOT NULL,
  `owner_type` enum('account','owner','user','group') NOT NULL DEFAULT 'account',
  `percentage` decimal(6,2) NOT NULL DEFAULT 0.00,
  `partner_group_id` varchar(50) DEFAULT NULL,
  `read_only` tinyint(1) NOT NULL DEFAULT 1,
  `saved_by` int(11) DEFAULT NULL,
  `saved_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_co_hist_month_account` (`company_id`,`effective_month`,`account_id`,`owner_type`),
  KEY `idx_co_hist_company_month` (`company_id`,`effective_month`),
  KEY `idx_co_hist_effective_month` (`effective_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Group earnings ownership: same pattern per group_id.
CREATE TABLE IF NOT EXISTS `group_ownership_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `group_id` varchar(50) NOT NULL,
  `owner_id` int(11) NOT NULL DEFAULT 0,
  `effective_month` date NOT NULL COMMENT 'First day of month, e.g. 2026-03-01',
  `account_id` int(11) NOT NULL,
  `owner_type` enum('owner','user','group') NOT NULL DEFAULT 'owner',
  `percentage` decimal(6,2) NOT NULL DEFAULT 0.00,
  `partner_group_id` varchar(50) DEFAULT NULL,
  `read_only` tinyint(1) NOT NULL DEFAULT 1,
  `saved_by` int(11) DEFAULT NULL,
  `saved_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_go_hist_month_account` (`group_id`,`effective_month`,`account_id`,`owner_type`),
  KEY `idx_go_hist_group_month` (`group_id`,`effective_month`),
  KEY `idx_go_hist_effective_month` (`effective_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: seed current live data as this month's snapshot (run once after deploy).
-- INSERT INTO company_ownership_history (company_id, effective_month, account_id, owner_type, percentage, partner_group_id, read_only, saved_by, saved_at)
-- SELECT co.company_id, DATE_FORMAT(CURDATE(), '%Y-%m-01'), co.account_id, co.owner_type, co.percentage, co.partner_group_id, COALESCE(co.read_only, 1), NULL, NOW()
-- FROM company_ownership co
-- ON DUPLICATE KEY UPDATE percentage = VALUES(percentage), partner_group_id = VALUES(partner_group_id), read_only = VALUES(read_only), saved_at = VALUES(saved_at);
