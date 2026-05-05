-- 删除并重建 process_backup：列与 process 对齐，并额外包含 description_name、created_name、company_name。
-- 执行：mysql -u <user> -p <database> < database/create_process_backup.sql
--
-- description_name：对应 description.name
-- created_name：创建者展示名（与 sync_process_backup.php / processlist 一致）
-- company_name：对应 company.name

DROP TABLE IF EXISTS process_backup;

CREATE TABLE process_backup (
  id int(11) NOT NULL AUTO_INCREMENT,
  process_id varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  description_id int(11) NOT NULL,
  description_name varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'description.name',
  currency_id int(11) NOT NULL,
  currency_name varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'currency.code',
  remove_word text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '多个词请用逗号分隔，例如: word1,word2,word3',
  replace_word_from varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需要被替换的原文字',
  replace_word_to varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '替换后的新文字',
  remark text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  status enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active=启用, inactive=停用',
  dts_modified datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更改时间',
  modified_by int(11) DEFAULT NULL,
  modified_name varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '修改者展示名',
  modified_by_type enum('user','owner') COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  modified_by_owner_id int(10) UNSIGNED DEFAULT NULL,
  dts_created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  created_by int(11) DEFAULT NULL,
  created_by_type enum('user','owner') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  created_by_owner_id int(11) DEFAULT NULL,
  created_name varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建者展示名',
  company_id int(10) UNSIGNED NOT NULL COMMENT '公司ID',
  company_name varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'company.name',
  sync_source_process_id int(11) DEFAULT NULL COMMENT '源 Process ID（用于 Multi-use Processes 同步 Formula）',
  PRIMARY KEY (id),
  KEY idx_process_backup_company_id (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
