-- ============================================================
-- 诊断 RATE 交易分录数据（AG110 <-> XE）
-- 请在生产数据库执行，将结果截图发给我
-- ============================================================

-- 1. 查看 AG110 和 XE 的 account.id
SELECT id, account_id, name 
FROM account 
WHERE account_id IN ('AG110', 'XE');

-- 2. 查看所有涉及 AG110 或 XE 的 transaction_entry 记录
SELECT 
    e.id,
    e.header_id,
    e.entry_type,
    e.account_id,
    a.account_id AS account_code,
    e.currency_id,
    c.code AS currency_code,
    e.amount,
    e.description,
    h.transaction_date,
    h.created_at
FROM transaction_entry e
JOIN transactions h ON e.header_id = h.id
JOIN account a ON e.account_id = a.id
LEFT JOIN currency c ON e.currency_id = c.id
WHERE h.company_id = 127
  AND h.transaction_type = 'RATE'
  AND a.account_id IN ('AG110', 'XE')
ORDER BY h.transaction_date DESC, h.created_at DESC, e.id;

-- 3. 查看主 transactions 表中的 RATE 记录（AG110/XE 相关）
SELECT 
    t.id,
    t.transaction_type,
    t.account_id,
    a_to.account_id AS to_account_code,
    t.from_account_id,
    a_from.account_id AS from_account_code,
    t.amount,
    t.currency_id,
    c.code AS currency_code,
    t.description,
    t.transaction_date,
    t.created_at
FROM transactions t
JOIN account a_to ON t.account_id = a_to.id
LEFT JOIN account a_from ON t.from_account_id = a_from.id
LEFT JOIN currency c ON t.currency_id = c.id
WHERE t.company_id = 127
  AND t.transaction_type = 'RATE'
  AND (a_to.account_id IN ('AG110', 'XE') OR a_from.account_id IN ('AG110', 'XE'))
ORDER BY t.transaction_date DESC, t.created_at DESC;
