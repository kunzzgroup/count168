-- ============================================================
-- 诊断 XE 在 MYR 的所有 Cr/Dr 来源
-- 请在生产数据库执行
-- ============================================================

-- 1. 找出所有 XE 账户ID
SELECT id, account_id, name FROM account WHERE account_id = 'XE';

-- 2. XE 作为 To Account 的 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM 交易 (MYR, 04-15)
SELECT t.id, t.transaction_type, t.account_id, t.from_account_id, t.amount, t.currency_id, 
       c.code AS currency_code, t.description, t.transaction_date
FROM transactions t
LEFT JOIN currency c ON t.currency_id = c.id
WHERE t.company_id = 127
  AND t.account_id IN (SELECT id FROM account WHERE account_id = 'XE')
  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
  AND c.code = 'MYR'
  AND t.transaction_date = '2026-04-15'
ORDER BY t.created_at DESC;

-- 3. XE 作为 From Account 的 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM 交易 (MYR, 04-15)
SELECT t.id, t.transaction_type, t.account_id, t.from_account_id, t.amount, t.currency_id, 
       c.code AS currency_code, t.description, t.transaction_date
FROM transactions t
LEFT JOIN currency c ON t.currency_id = c.id
WHERE t.company_id = 127
  AND t.from_account_id IN (SELECT id FROM account WHERE account_id = 'XE')
  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
  AND c.code = 'MYR'
  AND t.transaction_date = '2026-04-15'
ORDER BY t.created_at DESC;

-- 4. XE 在 transaction_entry 的所有 RATE 分录 (MYR, 04-15)
SELECT e.id, e.header_id, e.entry_type, e.account_id, a.account_id AS account_code,
       e.currency_id, c.code AS currency_code, e.amount, e.description, h.transaction_date
FROM transaction_entry e
JOIN transactions h ON e.header_id = h.id
JOIN account a ON e.account_id = a.id
LEFT JOIN currency c ON e.currency_id = c.id
WHERE h.company_id = 127
  AND h.transaction_type = 'RATE'
  AND e.account_id IN (SELECT id FROM account WHERE account_id = 'XE')
  AND c.code = 'MYR'
  AND h.transaction_date = '2026-04-15'
ORDER BY e.id;

-- 5. 模拟 search_api 的 bulk entry 查询结果 (仅 XE + MYR)
SELECT e.account_id, e.currency_id,
  SUM(CASE WHEN h.transaction_date BETWEEN '2026-04-15' AND '2026-04-15' AND e.entry_type <> 'RATE_MIDDLEMAN' THEN (
    CASE
      WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -ROUND(e.amount, 2)
      WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -ROUND(e.amount, 2)
      ELSE ROUND(e.amount, 2)
    END
  ) ELSE 0 END) AS wl_cr_dr_other,
  SUM(CASE WHEN h.transaction_date BETWEEN '2026-04-15' AND '2026-04-15' AND e.entry_type <> 'RATE_MIDDLEMAN' THEN 1 ELSE 0 END) AS wl_cr_dr_other_count
FROM transaction_entry e
JOIN transactions h ON e.header_id = h.id
WHERE h.company_id = 127
  AND e.company_id = 127
  AND h.transaction_type = 'RATE'
  AND e.account_id IN (SELECT id FROM account WHERE account_id = 'XE')
GROUP BY e.account_id, e.currency_id;
