-- Archive for companies removed from Domain (restore via Domain page or API).
-- Run once on production before deploying company_deletion_archive.php

CREATE TABLE IF NOT EXISTS `company_deletion_archive` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_db_id` int(10) UNSIGNED NOT NULL COMMENT 'company.id at deletion time',
  `company_code` varchar(50) NOT NULL DEFAULT '' COMMENT 'company.company_id business code',
  `owner_id` int(10) UNSIGNED DEFAULT NULL,
  `owner_code` varchar(50) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `group_id` varchar(50) DEFAULT NULL,
  `deleted_by_user_id` int(11) DEFAULT NULL,
  `deleted_by_owner_id` int(10) UNSIGNED DEFAULT NULL,
  `deleted_by_login` varchar(100) DEFAULT NULL,
  `deleted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `restored_at` timestamp NULL DEFAULT NULL,
  `restored_by_login` varchar(100) DEFAULT NULL,
  `status` enum('deleted','restored') NOT NULL DEFAULT 'deleted',
  `row_counts` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`row_counts`)),
  `payload` longtext NOT NULL COMMENT 'JSON: table => array of row objects',
  PRIMARY KEY (`id`),
  KEY `idx_cda_company_db_id` (`company_db_id`),
  KEY `idx_cda_company_code` (`company_code`),
  KEY `idx_cda_status_deleted_at` (`status`,`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
