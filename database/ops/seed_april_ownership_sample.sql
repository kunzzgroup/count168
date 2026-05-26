-- =============================================================================
-- April 2026 ownership sample snapshot (re-run safe)
-- =============================================================================
-- How to run (phpMyAdmin):
--   1. Select your database
--   2. Copy ALL lines below → SQL tab → Go (one shot)
--
-- What you get:
--   • One company (first with ownership rows) gets a 2026-04 snapshot
--   • Percentages = current live % with a simple demo tweak:
--       largest holder -5%, every other holder +2.5% each (2-holder case ≈ swap 5%)
--   • saved_at = 2026-04-05 14:30:00
--
-- View: https://count168.site/ownership → month 2026-04 → Manage that company
-- =============================================================================

-- 1) Ensure history table exists (safe if already created)
CREATE TABLE IF NOT EXISTS `company_ownership_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `effective_month` date NOT NULL,
  `account_id` int(11) NOT NULL,
  `owner_type` enum('account','owner','user','group') NOT NULL DEFAULT 'account',
  `percentage` decimal(6,2) NOT NULL DEFAULT 0.00,
  `partner_group_id` varchar(50) DEFAULT NULL,
  `read_only` tinyint(1) NOT NULL DEFAULT 1,
  `saved_by` int(11) DEFAULT NULL,
  `saved_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_co_hist_month_account` (`company_id`,`effective_month`,`account_id`,`owner_type`),
  KEY `idx_co_hist_company_month` (`company_id`,`effective_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Pick target company (first company_id that has non-account ownership)
DROP TEMPORARY TABLE IF EXISTS tmp_own_april_target;
CREATE TEMPORARY TABLE tmp_own_april_target AS
SELECT company_id
FROM company_ownership
WHERE owner_type != 'account'
GROUP BY company_id
ORDER BY company_id
LIMIT 1;

-- 3) Show target (empty = nothing to seed)
SELECT
  t.company_id,
  c.name AS company_name,
  c.company_id AS company_code,
  IF(t.company_id IS NULL, 'STOP: no company_ownership rows', 'OK: will seed April 2026') AS status
FROM tmp_own_april_target t
LEFT JOIN company c ON c.id = t.company_id;

-- 4) Remove old April demo for that company
DELETE h
FROM company_ownership_history h
INNER JOIN tmp_own_april_target t ON t.company_id = h.company_id
WHERE h.effective_month = '2026-04-01';

-- 5) Insert April snapshot (copy live rows, then tweak in step 6)
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
INNER JOIN tmp_own_april_target t ON t.company_id = co.company_id
WHERE co.owner_type != 'account';

-- 6) Demo adjustment: top holder -5%
UPDATE company_ownership_history h
INNER JOIN tmp_own_april_target t ON t.company_id = h.company_id
INNER JOIN (
  SELECT company_id, MAX(percentage) AS max_pct
  FROM company_ownership_history
  WHERE effective_month = '2026-04-01'
  GROUP BY company_id
) mx ON mx.company_id = h.company_id AND h.percentage = mx.max_pct
SET h.percentage = GREATEST(0.01, ROUND(h.percentage - 5, 2))
WHERE h.effective_month = '2026-04-01';

-- 7) Demo adjustment: other holders +2.5% each (keeps total ≈ 100 for 2–3 holders)
UPDATE company_ownership_history h
INNER JOIN tmp_own_april_target t ON t.company_id = h.company_id
INNER JOIN (
  SELECT company_id, MAX(percentage) AS max_pct
  FROM company_ownership_history
  WHERE effective_month = '2026-04-01'
  GROUP BY company_id
) mx ON mx.company_id = h.company_id
SET h.percentage = LEAST(100, ROUND(h.percentage + 2.5, 2))
WHERE h.effective_month = '2026-04-01'
  AND h.percentage < mx.max_pct;

-- 8) VERIFY — always works alone too (no @variables)
SELECT
  c.name AS company_name,
  c.company_id AS company_code,
  h.effective_month,
  h.owner_type,
  h.account_id,
  h.percentage,
  h.saved_at
FROM company_ownership_history h
JOIN company c ON c.id = h.company_id
WHERE h.effective_month = '2026-04-01'
ORDER BY c.name, h.percentage DESC;

DROP TEMPORARY TABLE IF EXISTS tmp_own_april_target;
