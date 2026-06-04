-- Bootstrap group tenants after dual-tenant schema (20260528).
-- Groups live in `groups` only; does NOT insert company_id = group_code rows.
-- Fixes account_company scope, tenant_module_policy, user_group_map.
-- Safe to re-run (idempotent).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

-- 1) Legacy: upgrade scope on rows still tied to group-entity companies (if any exist from old migrations)
UPDATE account_company ac
INNER JOIN company c ON c.id = ac.company_id
INNER JOIN `groups` g
  ON g.owner_id = c.owner_id
 AND UPPER(TRIM(g.group_code)) = UPPER(TRIM(c.company_id))
SET ac.scope_type = 'group',
    ac.scope_id = g.id;

-- Backfill scope_id for company-scoped rows still null
UPDATE account_company
SET scope_type = 'company',
    scope_id = company_id
WHERE scope_id IS NULL AND company_id IS NOT NULL;

-- 2) tenant_module_policy: enable modules when group has permissions JSON
UPDATE tenant_module_policy tmp
INNER JOIN `groups` g ON tmp.scope_type = 'group' AND tmp.scope_id = g.id
SET tmp.is_enabled = 1
WHERE tmp.module_key IN ('process', 'bankprocess')
  AND g.permissions IS NOT NULL
  AND TRIM(g.permissions) <> ''
  AND JSON_LENGTH(g.permissions) > 0;

INSERT INTO tenant_module_policy (scope_type, scope_id, module_key, is_enabled)
SELECT 'group', g.id, 'process', 1
FROM `groups` g
WHERE g.permissions IS NOT NULL AND TRIM(g.permissions) <> '' AND JSON_LENGTH(g.permissions) > 0
ON DUPLICATE KEY UPDATE is_enabled = GREATEST(tenant_module_policy.is_enabled, VALUES(is_enabled));

INSERT INTO tenant_module_policy (scope_type, scope_id, module_key, is_enabled)
SELECT 'group', g.id, 'bankprocess', 1
FROM `groups` g
WHERE g.permissions IS NOT NULL AND TRIM(g.permissions) <> '' AND JSON_LENGTH(g.permissions) > 0
ON DUPLICATE KEY UPDATE is_enabled = GREATEST(tenant_module_policy.is_enabled, VALUES(is_enabled));

-- 3) user_group_map from existing company access (subsidiaries under a group)
INSERT IGNORE INTO user_group_map (user_id, group_id)
SELECT DISTINCT ucm.user_id, g.id
FROM user_company_map ucm
INNER JOIN company c ON c.id = ucm.company_id
INNER JOIN `groups` g ON g.owner_id = c.owner_id
WHERE UPPER(TRIM(COALESCE(c.group_id, ''))) = UPPER(TRIM(g.group_code))
  AND UPPER(TRIM(c.company_id)) <> UPPER(TRIM(g.group_code));

-- 4) Drop legacy empty company_id placeholders (not group entities)
DELETE c FROM company c
WHERE TRIM(COALESCE(c.company_id, '')) = ''
  AND (c.group_id IS NULL OR TRIM(c.group_id) = '');

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
