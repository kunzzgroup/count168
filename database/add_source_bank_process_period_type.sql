-- 每笔 Bank process 入账交易单独记录 period_type，使同一天 monthly / inactive / partial_first_month 分开显示
-- 执行前请备份数据库。若使用 transactions_backup 触发器，需先给 transactions_backup 表加同名列并更新触发器。

ALTER TABLE `transactions`
  ADD COLUMN `source_bank_process_period_type` VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'Bank 入账类型：monthly / partial_first_month / manual_inactive'
  AFTER `source_bank_process_id`;

-- 可选：若存在 transactions_backup 表且需备份此列，可执行：
-- ALTER TABLE `transactions_backup`
--   ADD COLUMN `source_bank_process_period_type` VARCHAR(32) NULL DEFAULT NULL
--   COMMENT 'Bank 入账类型：monthly / partial_first_month / manual_inactive'
--   AFTER `source_bank_process_id`;
-- 并修改 trg_transactions_backup_insert / trg_transactions_backup_update 触发器，在 INSERT 列表中加入 source_bank_process_period_type。

-- ---------------------------------------------------------------------------
-- 可选一次性数据修正：2 个月合同（「2 MONTHS」或「1+1」）+ 每月 1 号 + 第二笔 monthly
-- 将 transactions.transaction_date 对齐为 bank_process.day_start，使 Payment History 同日显示两笔账单。
-- process_accounting_posted.posted_date 仍由应用层在入账时写入应付月（未改此表）。
-- 执行前请用下方 SELECT 核对，确认后再执行 UPDATE。
--
-- SELECT t.id, t.transaction_date, bp.day_start, bp.contract, bp.name
-- FROM transactions t
-- INNER JOIN bank_process bp ON bp.id = t.source_bank_process_id AND bp.company_id = t.company_id
-- WHERE t.source_bank_process_period_type = 'monthly'
--   AND COALESCE(bp.day_start_frequency, '1st_of_every_month') = '1st_of_every_month'
--   AND DAY(bp.day_start) = 1
--   AND t.transaction_date = DATE_FORMAT(DATE_ADD(DATE(bp.day_start), INTERVAL 1 MONTH), '%Y-%m-%d')
--   AND (
--     bp.contract REGEXP '^[[:space:]]*2[[:space:]]+MONTHS?[[:space:]]*$'
--     OR bp.contract REGEXP '^[[:space:]]*1\\+1[[:space:]]*$'
--   );

-- 核对无误后，取消下面 UPDATE 的注释并执行（一次性；已对齐过的行不会重复匹配）：
--
UPDATE transactions t
INNER JOIN bank_process bp ON bp.id = t.source_bank_process_id AND bp.company_id = t.company_id
SET t.transaction_date = DATE(bp.day_start)
WHERE t.source_bank_process_period_type = 'monthly'
AND COALESCE(bp.day_start_frequency, '1st_of_every_month') = '1st_of_every_month'
AND DAY(bp.day_start) = 1
AND t.transaction_date = DATE_FORMAT(DATE_ADD(DATE(bp.day_start), INTERVAL 1 MONTH), '%Y-%m-%d')
AND (
bp.contract REGEXP '^[[:space:]]*2[[:space:]]+MONTHS?[[:space:]]*$'
OR bp.contract REGEXP '^[[:space:]]*1\\+1[[:space:]]*$'
);
