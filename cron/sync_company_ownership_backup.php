<?php
/**
 * 将 company_ownership 全量同步到 company_ownership_backup。
 * company_name：来自 company.company_id（与其它 backup cron 一致）。
 * account_name：随 owner_type 解析（account→account.name；owner→owner.name；user→user.name；group→「Group:」+ partner_group_id）。
 * 若主表缺少 entity_type / group_id / include_group / partner_group_id / read_only，则用与线表一致的默认值写入备份。
 * 仅允许 CLI 执行，供 Hostinger Cron: php /path/to/cron/sync_company_ownership_backup.php
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once dirname(__DIR__) . '/config.php';

if ($pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() < 1) {
    fwrite(STDERR, '[' . date('c') . "] sync_company_ownership_backup: skip, company_ownership missing\n");
    exit(0);
}
if ($pdo->query("SHOW TABLES LIKE 'company_ownership_backup'")->rowCount() < 1) {
    fwrite(STDERR, '[' . date('c') . "] sync_company_ownership_backup: FAIL company_ownership_backup table missing\n");
    exit(1);
}

$srcCols = [];
foreach ($pdo->query('SHOW COLUMNS FROM company_ownership') as $row) {
    $srcCols[$row['Field']] = true;
}

$selEntityType = isset($srcCols['entity_type']) ? 'co.entity_type' : "'account'";
$selGroupId = isset($srcCols['group_id']) ? 'co.group_id' : 'NULL';
$selIncludeGroup = isset($srcCols['include_group']) ? 'co.include_group' : '1';
$selPartnerGroupId = isset($srcCols['partner_group_id']) ? 'co.partner_group_id' : 'NULL';
$selReadOnly = isset($srcCols['read_only']) ? 'co.read_only' : '1';

if (isset($srcCols['owner_type'])) {
    $selOwnerType = 'co.owner_type';
    $joinAccount = "a.id = co.account_id AND COALESCE(co.owner_type, 'account') = 'account'";
    $joinOwner = "o.id = co.account_id AND co.owner_type = 'owner'";
    $joinUser = "u.id = co.account_id AND co.owner_type = 'user'";
    $caseGroupWhen = "co.owner_type = 'group'";
} else {
    $selOwnerType = "'account'";
    $joinAccount = 'a.id = co.account_id';
    $joinOwner = '1 = 0';
    $joinUser = '1 = 0';
    $caseGroupWhen = '1 = 0';
}

$sqlDelete = 'DELETE FROM company_ownership_backup';
$sqlInsert = "
INSERT INTO company_ownership_backup (
  id, company_id, company_name, entity_type, account_id, account_name, group_id,
  include_group, partner_group_id, owner_type, percentage, read_only, created_at
)
SELECT
  co.id,
  co.company_id,
  COALESCE(c.company_id, '') AS company_name,
  {$selEntityType},
  co.account_id,
  CASE
    WHEN {$caseGroupWhen} THEN CONCAT('Group: ', COALESCE({$selPartnerGroupId}, ''))
    ELSE COALESCE(a.name, o.name, u.name, '')
  END AS account_name,
  {$selGroupId},
  {$selIncludeGroup},
  {$selPartnerGroupId},
  {$selOwnerType},
  co.percentage,
  {$selReadOnly},
  co.created_at
  
FROM company_ownership co
LEFT JOIN company c ON c.id = co.company_id
LEFT JOIN account a ON {$joinAccount}
LEFT JOIN owner o ON {$joinOwner}
LEFT JOIN user u ON {$joinUser}
";

try {
    $pdo->beginTransaction();
    $pdo->exec($sqlDelete);
    $inserted = $pdo->exec($sqlInsert);
    $pdo->commit();
    fwrite(STDERR, '[' . date('c') . "] sync_company_ownership_backup: OK, inserted={$inserted}\n");
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, '[' . date('c') . '] sync_company_ownership_backup: FAIL ' . $e->getMessage() . "\n");
    exit(1);
}
