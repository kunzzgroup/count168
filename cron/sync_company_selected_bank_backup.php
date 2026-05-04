<?php
/**
 * 将 company_selected_bank 全量同步到 company_selected_bank_backup。
 * company_name 来自 company.company_id；bank_name 来自 bank.name。
 * 仅允许 CLI 执行，供 Hostinger Cron: php /path/to/cron/sync_company_selected_bank_backup.php
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once dirname(__DIR__) . '/config.php';

$sqlDelete = 'DELETE FROM company_selected_bank_backup';
$sqlInsert = <<<'SQL'
INSERT INTO company_selected_bank_backup (
  id, company_id, company_name, country, bank, created_at, sort_order
)
SELECT
  cs.id,
  cs.company_id,
  COALESCE(c.company_id, '') AS company_name,
  cs.country,
  cs.bank,
  cs.created_at,
  cs.sort_order
FROM company_selected_banks cs
LEFT JOIN company c ON c.id = cs.company_id
SQL;

try {
    $pdo->beginTransaction();
    $pdo->exec($sqlDelete);
    $inserted = $pdo->exec($sqlInsert);
    $pdo->commit();
    fwrite(STDERR, '[' . date('c') . "] sync_company_selected_bank_backup: OK, inserted={$inserted}\n");
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, '[' . date('c') . '] sync_company_selected_bank_backup: FAIL ' . $e->getMessage() . "\n");
    exit(1);
}
