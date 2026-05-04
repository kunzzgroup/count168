<?php
/**
 * 将 company_selected_banks 全量同步到 company_selected_bank_backup。
 * 主表无 id / created_at，仅 company_id、country、bank、sort_order（与 database/company_selected_banks.sql 一致）。
 * company_name：来自 company.company_id（与其它 backup cron 一致）。
 * 若线表名为 company_selected_bank（无 s），请将下方 $srcTable 改为该名。
 * 仅允许 CLI 执行，供 Hostinger Cron: php /path/to/cron/sync_company_selected_bank_backup.php
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once dirname(__DIR__) . '/config.php';

$srcTable = null;
if ($pdo->query("SHOW TABLES LIKE 'company_selected_banks'")->rowCount() > 0) {
    $srcTable = 'company_selected_banks';
} elseif ($pdo->query("SHOW TABLES LIKE 'company_selected_bank'")->rowCount() > 0) {
    $srcTable = 'company_selected_bank';
}
if ($srcTable === null) {
    fwrite(STDERR, '[' . date('c') . "] sync_company_selected_bank_backup: skip, source table missing\n");
    exit(0);
}

if ($pdo->query("SHOW TABLES LIKE 'company_selected_bank_backup'")->rowCount() < 1) {
    fwrite(STDERR, '[' . date('c') . "] sync_company_selected_bank_backup: FAIL company_selected_bank_backup missing\n");
    exit(1);
}

$sqlDelete = 'DELETE FROM company_selected_bank_backup';
$sqlInsert = "
INSERT INTO company_selected_bank_backup (
  company_id, company_name, country, bank, sort_order
)
SELECT
  cs.company_id,
  COALESCE(c.company_id, '') AS company_name,
  cs.country,
  cs.bank,
  cs.sort_order
FROM `{$srcTable}` cs
LEFT JOIN company c ON c.id = cs.company_id
";

try {
    $pdo->beginTransaction();
    $pdo->exec($sqlDelete);
    $inserted = $pdo->exec($sqlInsert);
    $pdo->commit();
    fwrite(STDERR, '[' . date('c') . "] sync_company_selected_bank_backup: OK, src={$srcTable}, inserted={$inserted}\n");
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, '[' . date('c') . '] sync_company_selected_bank_backup: FAIL ' . $e->getMessage() . "\n");
    exit(1);
}
