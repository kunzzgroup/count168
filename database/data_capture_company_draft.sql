-- Bank Data Capture 表格草稿（SALARY / COMMISSION / BONUS）
-- Run: mysql -u <user> -p <database> < database/data_capture_company_draft.sql

CREATE TABLE IF NOT EXISTS `data_capture_company_draft` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `company_id` INT NOT NULL COMMENT 'company.id',
    `process_key` VARCHAR(64) NOT NULL COMMENT 'SALARY / COMMISSION / BONUS',
    `currency_id` INT NOT NULL COMMENT 'currency.id',
    `draft_json` LONGTEXT NOT NULL COMMENT 'captureTableData() JSON',
    `updated_by` INT NULL COMMENT 'user.id 或 owner.id',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_company_process_currency` (`company_id`, `process_key`, `currency_id`),
    KEY `idx_company_id` (`company_id`),
    KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
