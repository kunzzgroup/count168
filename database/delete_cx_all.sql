-- 删除 CX 公司 (id=137) 全部数据 — 执行前请先备份数据库
-- 用法: 在 phpMyAdmin / MySQL 选中 u857194726_count168 后整段执行
SET @cx := 137;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

DELETE te FROM `transaction_entry` te
INNER JOIN `transactions` t ON t.id = te.header_id
WHERE t.company_id = @cx;

DELETE FROM `transactions` WHERE company_id = @cx;
DELETE FROM `transactions_backup` WHERE company_id = @cx;
DELETE FROM `transactions_rate` WHERE company_id = @cx;
DELETE FROM `transactions_deleted` WHERE company_id = @cx;

DELETE FROM `data_capture_details` WHERE company_id = @cx;
DELETE FROM `data_captures` WHERE company_id = @cx;
DELETE FROM `data_capture_summary_state` WHERE company_id = @cx;
DELETE FROM `data_capture_submit_queue` WHERE company_id = @cx;
DELETE FROM `data_capture_templates` WHERE company_id = @cx;
DELETE FROM `data_captures_deleted` WHERE company_id = @cx;

DELETE FROM `submitted_processes` WHERE company_id = @cx;
DELETE pd FROM `process_day` pd
INNER JOIN `process` p ON p.id = pd.process_id
WHERE p.company_id = @cx;
DELETE d FROM `description` d
INNER JOIN `process` p ON p.description_id = d.id
WHERE p.company_id = @cx;
DELETE FROM `process` WHERE company_id = @cx;

DELETE FROM `bank_process_maintenance_resend_pending` WHERE company_id = @cx;
DELETE FROM `bank_process_accounting_resend_daily_guard` WHERE company_id = @cx;
DELETE FROM `process_accounting_posted` WHERE company_id = @cx;
DELETE FROM `process_accounting_due_dismissed` WHERE company_id = @cx;
DELETE FROM `bank_process` WHERE company_id = @cx;

DELETE FROM `user_company_permissions` WHERE company_id = @cx;
DELETE FROM `user_company_map` WHERE company_id = @cx;

DELETE acdo FROM `account_currency_display_order` acdo
INNER JOIN `account_company` ac ON ac.account_id = acdo.account_id
WHERE ac.company_id = @cx;
DELETE acur FROM `account_currency` acur
INNER JOIN `account_company` ac ON ac.account_id = acur.account_id
WHERE ac.company_id = @cx;
DELETE FROM `account_link` WHERE company_id = @cx;
DELETE a FROM `account` a
INNER JOIN `account_company` ac ON ac.account_id = a.id
WHERE ac.company_id = @cx;
DELETE FROM `account_company` WHERE company_id = @cx;

DELETE FROM `company_selected_banks` WHERE company_id = @cx;
DELETE FROM `company_selected_countries` WHERE company_id = @cx;
DELETE FROM `company_countries` WHERE company_id = @cx;
DELETE FROM `company_auto_renew_request` WHERE company_id = @cx;
DELETE FROM `company_ownership` WHERE company_id = @cx;
DELETE FROM `currency` WHERE company_id = @cx;
DELETE FROM `company` WHERE id = @cx;

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
