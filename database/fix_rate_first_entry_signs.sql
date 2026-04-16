-- ============================================================
-- Fix RATE_FIRST_FROM / RATE_FIRST_TO sign convention
-- ============================================================
-- 问题：RATE_FIRST_FROM/TO 的存储符号与 RATE_TRANSFER_FROM/TO 相反，
--       但 search_api 统一使用 -ROUND(e.amount) 读取，导致第一行（SGD 侧）
--       Cr/Dr 正负颠倒。
--
-- 修复：翻转所有已有 RATE_FIRST_FROM 和 RATE_FIRST_TO 行的 amount 符号。
--       新提交的数据将由 submit_api.php 的修复代码自动写入正确符号。
--
-- 影响范围：仅影响 transaction_entry 表中 entry_type 为
--           RATE_FIRST_FROM 或 RATE_FIRST_TO 的行。
-- ============================================================

-- 先确认受影响的行数（仅查看，不修改）
SELECT 
    entry_type,
    COUNT(*) AS row_count,
    SUM(amount) AS total_amount_before
FROM transaction_entry
WHERE entry_type IN ('RATE_FIRST_FROM', 'RATE_FIRST_TO')
GROUP BY entry_type;

-- 执行修复：翻转 amount 的符号
UPDATE transaction_entry
SET amount = -amount
WHERE entry_type IN ('RATE_FIRST_FROM', 'RATE_FIRST_TO');

-- 验证修复后的数据
SELECT 
    entry_type,
    COUNT(*) AS row_count,
    SUM(amount) AS total_amount_after
FROM transaction_entry
WHERE entry_type IN ('RATE_FIRST_FROM', 'RATE_FIRST_TO')
GROUP BY entry_type;
