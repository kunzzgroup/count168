-- Data Capture 草稿统一表（Group + Company）
-- Run: mysql -u <user> -p <database> < database/data_capture_draft.sql

CREATE TABLE IF NOT EXISTS `data_capture_draft` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `scope_type` ENUM('group', 'company') NOT NULL COMMENT '草稿归属：group=集团, company=公司',
    `group_id` VARCHAR(50) NULL COMMENT '集团代码；scope_type=group 时必填',
    `company_id` INT NULL COMMENT 'company.id；scope_type=company 时必填',
    `process_key` VARCHAR(64) NOT NULL COMMENT 'SALARY / COMMISSION / BONUS / pid_xxx',
    `currency_id` INT NOT NULL COMMENT 'currency.id',
    `draft_json` LONGTEXT NOT NULL COMMENT 'captureTableData() JSON',
    `updated_by` INT NULL COMMENT 'user.id 或 owner.id',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_group_process_currency` (`group_id`, `process_key`, `currency_id`),
    UNIQUE KEY `uk_company_process_currency` (`company_id`, `process_key`, `currency_id`),
    KEY `idx_scope_type` (`scope_type`),
    KEY `idx_group_id` (`group_id`),
    KEY `idx_company_id` (`company_id`),
    KEY `idx_updated_at` (`updated_at`),
    CONSTRAINT `chk_data_capture_draft_scope` CHECK (
        (`scope_type` = 'group' AND `group_id` IS NOT NULL AND `company_id` IS NULL)
        OR (`scope_type` = 'company' AND `company_id` IS NOT NULL AND `group_id` IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 从旧表迁移（若存在）
INSERT INTO `data_capture_draft`
    (`scope_type`, `group_id`, `company_id`, `process_key`, `currency_id`, `draft_json`, `updated_by`, `updated_at`)
SELECT
    'group', TRIM(`group_id`), NULL, UPPER(TRIM(`process_key`)), `currency_id`, `draft_json`, `updated_by`, `updated_at`
FROM `data_capture_group_draft`
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'data_capture_group_draft')
ON DUPLICATE KEY UPDATE
    `draft_json` = VALUES(`draft_json`),
    `updated_by` = VALUES(`updated_by`),
    `updated_at` = VALUES(`updated_at`);

INSERT INTO `data_capture_draft`
    (`scope_type`, `group_id`, `company_id`, `process_key`, `currency_id`, `draft_json`, `updated_by`, `updated_at`)
SELECT
    'company', NULL, `company_id`, UPPER(TRIM(`process_key`)), `currency_id`, `draft_json`, `updated_by`, `updated_at`
FROM `data_capture_company_draft`
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'data_capture_company_draft')
ON DUPLICATE KEY UPDATE
    `draft_json` = VALUES(`draft_json`),
    `updated_by` = VALUES(`updated_by`),
    `updated_at` = VALUES(`updated_at`);
