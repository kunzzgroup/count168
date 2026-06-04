-- Optional one-off: remove company rows where company_id = group_code (AP/IG/APG).
-- Run after 20260604 and after deploying PHP with gc_use_group_entity_company_row() = false.
-- Repoints group-ledger account_company to the first subsidiary in each group (FK anchor only).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

UPDATE account_company ac
INNER JOIN company c_ent ON c_ent.id = ac.company_id
INNER JOIN `groups` g
  ON g.owner_id = c_ent.owner_id
 AND UPPER(TRIM(g.group_code)) = UPPER(TRIM(c_ent.company_id))
INNER JOIN (
  SELECT g2.id AS group_pk, MIN(c_sub.id) AS sub_company_pk
  FROM `groups` g2
  INNER JOIN company c_sub
    ON c_sub.owner_id = g2.owner_id
   AND UPPER(TRIM(COALESCE(c_sub.group_id, ''))) = UPPER(TRIM(g2.group_code))
   AND UPPER(TRIM(c_sub.company_id)) <> UPPER(TRIM(g2.group_code))
  GROUP BY g2.id
) sub ON sub.group_pk = g.id
SET ac.company_id = sub.sub_company_pk,
    ac.scope_type = 'group',
    ac.scope_id = g.id
WHERE ac.scope_type = 'group' OR UPPER(TRIM(c_ent.company_id)) = UPPER(TRIM(g.group_code));

DELETE c FROM company c
INNER JOIN `groups` g
  ON g.owner_id = c.owner_id
 AND UPPER(TRIM(g.group_code)) = UPPER(TRIM(c.company_id));

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
