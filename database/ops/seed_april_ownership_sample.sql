-- =============================================================================
-- April 2026 ownership sample — phpMyAdmin 分步版（不用临时表）
-- =============================================================================
-- 若 history 表是空的，按顺序执行下面 STEP 1 → 2 → 3
-- =============================================================================

-- ── STEP 1：诊断（可单独跑）────────────────────────────────────────────
-- 1a) 主表有没有 ownership 数据？
SELECT company_id, owner_type, account_id, percentage
FROM company_ownership
WHERE owner_type != 'account'
ORDER BY company_id, percentage DESC
LIMIT 30;

-- 1b) 若 1a 有行，记下任意一个 company_id（数字主键）
-- 1c) history 表当前是否为空？
SELECT COUNT(*) AS history_row_count FROM company_ownership_history;


-- ── STEP 2：写入 4 月示例（整段选中一次 Execute）──────────────────────
-- 自动选「第一家有 ownership 的公司」；若无数据则 INSERT 0 行

DELETE FROM company_ownership_history
WHERE effective_month = '2026-04-01'
  AND company_id = (
    SELECT cid FROM (
      SELECT company_id AS cid
      FROM company_ownership
      WHERE owner_type != 'account'
      GROUP BY company_id
      ORDER BY company_id
      LIMIT 1
    ) pick
  );

INSERT INTO company_ownership_history (
  company_id,
  effective_month,
  account_id,
  owner_type,
  percentage,
  partner_group_id,
  read_only,
  saved_by,
  saved_at
)
SELECT
  src.company_id,
  '2026-04-01',
  src.account_id,
  src.owner_type,
  CASE
    WHEN src.holder_cnt <= 1 THEN src.percentage
    WHEN src.percentage = src.max_pct THEN GREATEST(0.01, ROUND(src.percentage - 5, 2))
    ELSE ROUND(src.percentage + (5 / (src.holder_cnt - 1)), 2)
  END,
  src.partner_group_id,
  src.read_only,
  NULL,
  '2026-04-05 14:30:00'
FROM (
  SELECT
    co.company_id,
    co.account_id,
    co.owner_type,
    co.percentage,
    co.partner_group_id,
    COALESCE(co.read_only, 1) AS read_only,
    agg.max_pct,
    agg.holder_cnt
  FROM company_ownership co
  INNER JOIN (
    SELECT company_id AS cid
    FROM company_ownership
    WHERE owner_type != 'account'
    GROUP BY company_id
    ORDER BY company_id
    LIMIT 1
  ) pick ON pick.cid = co.company_id
  INNER JOIN (
    SELECT
      company_id,
      MAX(percentage) AS max_pct,
      COUNT(*) AS holder_cnt
    FROM company_ownership
    WHERE owner_type != 'account'
    GROUP BY company_id
  ) agg ON agg.company_id = co.company_id
  WHERE co.owner_type != 'account'
) src;


-- ── STEP 3：验证（可单独跑）──────────────────────────────────────────
SELECT
  c.company_id AS company_name,
  h.effective_month,
  h.owner_type,
  h.account_id,
  h.percentage,
  h.saved_at
FROM company_ownership_history h
JOIN company c ON c.id = h.company_id
WHERE h.effective_month = '2026-04-01'
ORDER BY c.company_id, h.percentage DESC;


-- =============================================================================
-- 若 STEP 1a 无数据，或 STEP 2 后仍 0 行：用手动版（改 @co_id）
-- =============================================================================
/*
SET @co_id = 1;   -- ← 改成你 company 表的主键 id（不是 company_id 字符串）

DELETE FROM company_ownership_history
WHERE company_id = @co_id AND effective_month = '2026-04-01';

INSERT INTO company_ownership_history (
  company_id, effective_month, account_id, owner_type,
  percentage, partner_group_id, read_only, saved_by, saved_at
)
SELECT
  co.company_id,
  '2026-04-01',
  co.account_id,
  co.owner_type,
  co.percentage,
  co.partner_group_id,
  COALESCE(co.read_only, 1),
  NULL,
  '2026-04-05 14:30:00'
FROM company_ownership co
WHERE co.company_id = @co_id
  AND co.owner_type != 'account';
*/
