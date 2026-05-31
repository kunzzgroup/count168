-- CX lost data ONLY from dump-u857194726_c168site-202605312008.sql
-- Date filter (transactional): 2026-05-01 .. 2026-05-31
-- INSERT IGNORE only — no CREATE TRIGGER / PROCEDURE (avoids DEFINER import errors)
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- company_selected_banks: 11 rows (missing in c168)
INSERT IGNORE INTO `company_selected_banks` (`company_id`, `country`, `bank`, `sort_order`) VALUES
(137,'AUD','ANZ',4),
(137,'AUD','SUNCROP',1),
(137,'AUD','SUNCROP ABN',3),
(137,'AUD','UBANK',0),
(137,'AUD','WESTPAC',2),
(137,'MYR','RHB',0),
(137,'SGD','ANEXT',0),
(137,'SGD','CIMB',1),
(137,'SGD','GXS',2),
(137,'SGD','MARI',3),
(137,'SGD','OCBC',4);

-- company_selected_countries: 3 rows (missing in c168)
INSERT IGNORE INTO `company_selected_countries` (`company_id`, `country`, `sort_order`) VALUES
(137,'AUD',0),
(137,'MYR',1),
(137,'SGD',2);

-- account_company: 1 rows (missing in c168)
INSERT IGNORE INTO `account_company` (`id`, `account_id`, `company_id`, `created_at`, `updated_at`) VALUES
(6284,5144,137,'2026-05-28 07:58:48','2026-05-28 07:58:48');

-- account_link: 1 rows (missing in c168)
INSERT IGNORE INTO `account_link` (`id`, `account_id_1`, `account_id_2`, `company_id`, `link_type`, `source_account_id`, `created_at`, `updated_at`) VALUES
(191,4837,5144,5,'bidirectional',NULL,'2026-05-08 03:46:15','2026-05-08 03:46:15');

-- transactions: 30 rows (missing in c168)
INSERT IGNORE INTO `transactions` (`id`, `company_id`, `transaction_type`, `account_id`, `from_account_id`, `currency_id`, `amount`, `transaction_date`, `description`, `sms`, `created_by`, `created_by_owner`, `created_at`, `updated_at`, `approval_status`, `approved_by`, `approved_by_owner`, `approved_at`, `source_bank_process_id`, `source_bank_process_period_type`) VALUES
(8380,137,'CONTRA',4431,4418,202,1600.00000000,'2026-05-04','CONTRA FROM BS002','',284,NULL,'2026-05-04 09:50:41','2026-05-04 09:50:41','APPROVED',284,NULL,'2026-05-04 09:50:41',NULL,NULL),
(8381,137,'CONTRA',4431,4418,202,100.00000000,'2026-05-04','CONTRA FROM BS002','',284,NULL,'2026-05-04 09:51:14','2026-05-04 09:51:14','APPROVED',284,NULL,'2026-05-04 09:51:14',NULL,NULL),
(8382,137,'CONTRA',4431,4418,202,1000.00000000,'2026-05-04','CONTRA FROM BS002','',284,NULL,'2026-05-04 09:51:38','2026-05-04 09:51:38','APPROVED',284,NULL,'2026-05-04 09:51:38',NULL,NULL),
(8872,137,'WIN',5147,NULL,244,600.00000000,'2026-05-10','Process: Buy Price for SUNCROP*2',NULL,284,3,'2026-05-10 14:13:51','2026-05-10 14:13:51','APPROVED',NULL,3,'2026-05-10 14:13:51',433,'monthly'),
(8873,137,'LOSE',5148,NULL,244,1200.00000000,'2026-05-10','Process: Sell Price for SUNCROP*2',NULL,284,3,'2026-05-10 14:13:51','2026-05-10 14:13:51','APPROVED',NULL,3,'2026-05-10 14:13:51',433,'monthly'),
(8874,137,'WIN',4419,NULL,244,600.00000000,'2026-05-10','Process: Profit for SUNCROP*2',NULL,284,3,'2026-05-10 14:13:51','2026-05-10 14:13:51','APPROVED',NULL,3,'2026-05-10 14:13:51',433,'monthly'),
(9341,137,'WIN',5147,NULL,244,300.00000000,'2026-05-14','Process: Buy Price for UBANK*3 (once)',NULL,284,3,'2026-05-14 16:53:49','2026-05-14 16:53:49','APPROVED',NULL,3,'2026-05-14 16:53:49',466,'once_one_off'),
(9342,137,'LOSE',5146,NULL,244,750.00000000,'2026-05-14','Process: Sell Price for UBANK*3 (once)',NULL,284,3,'2026-05-14 16:53:49','2026-05-14 16:53:49','APPROVED',NULL,3,'2026-05-14 16:53:49',466,'once_one_off'),
(9343,137,'WIN',4419,NULL,244,450.00000000,'2026-05-14','Process: Profit for UBANK*3 (once)',NULL,284,3,'2026-05-14 16:53:49','2026-05-14 16:53:49','APPROVED',NULL,3,'2026-05-14 16:53:49',466,'once_one_off'),
(9371,137,'WIN',5147,NULL,244,200.00000000,'2026-05-15','Process: Buy Price for WESTPAC ABN*1 (once)',NULL,284,3,'2026-05-15 13:04:51','2026-05-15 13:04:51','APPROVED',NULL,3,'2026-05-15 13:04:51',467,'once_one_off'),
(9372,137,'LOSE',5159,NULL,244,400.00000000,'2026-05-15','Process: Sell Price for WESTPAC ABN*1 (once)',NULL,284,3,'2026-05-15 13:04:51','2026-05-15 13:04:51','APPROVED',NULL,3,'2026-05-15 13:04:51',467,'once_one_off'),
(9373,137,'WIN',4419,NULL,244,200.00000000,'2026-05-15','Process: Profit for WESTPAC ABN*1 (once)',NULL,284,3,'2026-05-15 13:04:51','2026-05-15 13:04:51','APPROVED',NULL,3,'2026-05-15 13:04:51',467,'once_one_off'),
(9374,137,'WIN',5147,NULL,244,450.00000000,'2026-05-15','Process: Buy Price for UBANK*3 (once)',NULL,284,3,'2026-05-15 13:04:51','2026-05-15 13:04:51','APPROVED',NULL,3,'2026-05-15 13:04:51',468,'once_one_off'),
(9375,137,'LOSE',5159,NULL,244,840.00000000,'2026-05-15','Process: Sell Price for UBANK*3 (once)',NULL,284,3,'2026-05-15 13:04:51','2026-05-15 13:04:51','APPROVED',NULL,3,'2026-05-15 13:04:51',468,'once_one_off'),
(9376,137,'WIN',4419,NULL,244,390.00000000,'2026-05-15','Process: Profit for UBANK*3 (once)',NULL,284,3,'2026-05-15 13:04:51','2026-05-15 13:04:51','APPROVED',NULL,3,'2026-05-15 13:04:51',468,'once_one_off'),
(9427,137,'WIN',5147,NULL,244,800.00000000,'2026-05-16','Process: Buy Price for UBANK*8 (once)',NULL,284,3,'2026-05-17 05:42:29','2026-05-17 05:42:29','APPROVED',NULL,3,'2026-05-17 05:42:29',470,'once_one_off'),
(9428,137,'LOSE',5146,NULL,244,2000.00000000,'2026-05-16','Process: Sell Price for UBANK*8 (once)',NULL,284,3,'2026-05-17 05:42:29','2026-05-17 05:42:29','APPROVED',NULL,3,'2026-05-17 05:42:29',470,'once_one_off'),
(9429,137,'WIN',4419,NULL,244,1200.00000000,'2026-05-16','Process: Profit for UBANK*8 (once)',NULL,284,3,'2026-05-17 05:42:29','2026-05-17 05:42:29','APPROVED',NULL,3,'2026-05-17 05:42:29',470,'once_one_off'),
(9442,137,'PAYMENT',5147,5159,244,1240.00000000,'2026-05-16','PAYMENT FROM BC011','',284,NULL,'2026-05-17 06:17:23','2026-05-17 07:08:30','APPROVED',NULL,3,'2026-05-17 07:08:30',NULL,NULL),
(9452,137,'WIN',4591,NULL,209,1209.67000000,'2026-05-17','Process: Buy Price for BIKE RESCUE PTE LTD (partial first month)',NULL,284,3,'2026-05-17 09:07:44','2026-05-17 09:07:44','APPROVED',NULL,3,'2026-05-17 09:07:44',469,'partial_first_month'),
(9453,137,'LOSE',5167,NULL,209,1451.61000000,'2026-05-17','Process: Sell Price for BIKE RESCUE PTE LTD (partial first month)',NULL,284,3,'2026-05-17 09:07:44','2026-05-17 09:07:44','APPROVED',NULL,3,'2026-05-17 09:07:44',469,'partial_first_month'),
(9454,137,'WIN',4419,NULL,209,241.93000000,'2026-05-17','Process: Profit for BIKE RESCUE PTE LTD (partial first month)',NULL,284,3,'2026-05-17 09:07:44','2026-05-17 09:07:44','APPROVED',NULL,3,'2026-05-17 09:07:44',469,'partial_first_month'),
(9682,137,'WIN',5147,NULL,244,200.00000000,'2026-05-20','Process: Buy Price for SUNCROP*2 (once)',NULL,284,3,'2026-05-20 11:03:26','2026-05-20 11:03:26','APPROVED',NULL,3,'2026-05-20 11:03:26',476,'once_one_off'),
(9683,137,'LOSE',5146,NULL,244,500.00000000,'2026-05-20','Process: Sell Price for SUNCROP*2 (once)',NULL,284,3,'2026-05-20 11:03:26','2026-05-20 11:03:26','APPROVED',NULL,3,'2026-05-20 11:03:26',476,'once_one_off'),
(9684,137,'WIN',4419,NULL,244,300.00000000,'2026-05-20','Process: Profit for SUNCROP*2 (once)',NULL,284,3,'2026-05-20 11:03:26','2026-05-20 11:03:26','APPROVED',NULL,3,'2026-05-20 11:03:26',476,'once_one_off'),
(9685,137,'PAYMENT',5147,5175,244,1175.00000000,'2026-05-20','PAYMENT FROM BC012','',284,NULL,'2026-05-20 11:09:10','2026-05-20 11:09:10','APPROVED',284,NULL,'2026-05-20 11:09:10',NULL,NULL),
(9686,137,'PAYMENT',5147,5175,244,1785.00000000,'2026-05-20','PAYMENT FROM BC012','',284,NULL,'2026-05-20 11:09:44','2026-05-20 11:09:44','APPROVED',284,NULL,'2026-05-20 11:09:44',NULL,NULL),
(9728,137,'WIN',5147,NULL,244,450.00000000,'2026-05-21','Process: Buy Price for SUNCROP*3 (once)',NULL,284,3,'2026-05-21 09:16:26','2026-05-21 09:16:26','APPROVED',NULL,3,'2026-05-21 09:16:26',477,'once_one_off'),
(9729,137,'LOSE',5159,NULL,244,750.00000000,'2026-05-21','Process: Sell Price for SUNCROP*3 (once)',NULL,284,3,'2026-05-21 09:16:26','2026-05-21 09:16:26','APPROVED',NULL,3,'2026-05-21 09:16:26',477,'once_one_off'),
(9730,137,'WIN',4419,NULL,244,300.00000000,'2026-05-21','Process: Profit for SUNCROP*3 (once)',NULL,284,3,'2026-05-21 09:16:26','2026-05-21 09:16:26','APPROVED',NULL,3,'2026-05-21 09:16:26',477,'once_one_off');

-- bank_process_maintenance_resend_pending: 4 rows (missing in c168)
INSERT IGNORE INTO `bank_process_maintenance_resend_pending` (`id`, `company_id`, `bank_process_id`, `process_accounting_posted_id`, `period_type`, `transaction_date`, `created_at`) VALUES
(824,137,478,1400,'once_one_off','2026-05-23','2026-05-23 09:14:58'),
(826,137,420,1402,'resend_consolidated_range','2026-04-01','2026-05-25 00:55:53'),
(834,137,469,1410,'resend_consolidated_range','2026-05-17','2026-05-25 02:07:59'),
(835,137,189,1416,'resend_consolidated_range','2026-03-01','2026-05-25 04:12:08');

-- bank_process_accounting_resend_daily_guard: 4 rows (missing in c168)
INSERT IGNORE INTO `bank_process_accounting_resend_daily_guard` (`id`, `company_id`, `bank_process_id`, `resend_day_start`, `guard_date`, `created_at`) VALUES
(177,137,189,'2026-03-18','2026-05-23','2026-05-23 09:17:01'),
(180,137,420,'2026-04-01','2026-05-25','2026-05-25 00:55:42'),
(181,137,189,'2026-03-18','2026-05-25','2026-05-25 01:13:08'),
(186,137,469,'2026-05-17','2026-05-25','2026-05-25 02:02:28');

-- process_accounting_posted: 4 rows (missing in c168)
INSERT IGNORE INTO `process_accounting_posted` (`id`, `company_id`, `process_id`, `posted_date`, `period_type`, `created_at`) VALUES
(1406,137,189,'2026-05-17','resend_consolidated_range_skipped','2026-05-25 09:48:18'),
(1414,137,469,'2026-08-01','monthly_skipped','2026-05-25 10:02:28'),
(1415,137,469,'2026-05-17','partial_first_month_skipped','2026-05-25 10:02:28'),
(1416,137,189,'2026-03-01','resend_consolidated_range_skipped','2026-05-25 12:12:08');

-- process_accounting_due_dismissed: 3 rows (missing in c168)
INSERT IGNORE INTO `process_accounting_due_dismissed` (`id`, `company_id`, `process_id`, `period_type`, `anchor_date`, `created_at`) VALUES
(6,137,420,'resend_consolidated_range','2026-04-01','2026-05-25 00:55:53'),
(9,137,189,'resend_consolidated_range','2026-05-17','2026-05-25 01:48:18'),
(13,137,189,'resend_consolidated_range','2026-03-01','2026-05-25 04:12:08');

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;

-- Summary:
--   company_selected_banks: 11
--   company_selected_countries: 3
--   account_company: 1
--   account_link: 1
--   transactions: 30
--   bank_process_maintenance_resend_pending: 4
--   bank_process_accounting_resend_daily_guard: 4
--   process_accounting_posted: 4
--   process_accounting_due_dismissed: 3