<?php
/**
 * Backfill company_ownership_history / group_ownership_history for a past month
 * from current live tables (use after ownership data adjustment).
 *
 * Usage: php cron/backfill_ownership_history_month.php 2026-04
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once dirname(__DIR__) . '/includes/config.php';
require_once dirname(__DIR__) . '/api/includes/ownership_history.php';

$monthKey = $argv[1] ?? '';
if ($monthKey === '') {
    fwrite(STDERR, "Usage: php cron/backfill_ownership_history_month.php YYYY-MM\n");
    exit(1);
}

try {
    $pdo->beginTransaction();
    $result = ownership_history_backfill_month_from_live($pdo, $monthKey, null);
    $pdo->commit();
    fwrite(
        STDERR,
        '[' . date('c') . "] backfill_ownership_history_month: OK month={$monthKey}"
        . " effective_month={$result['effective_month']}"
        . " company_rows={$result['company_rows']}"
        . " group_rows={$result['group_rows']}\n"
    );
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, '[' . date('c') . '] backfill_ownership_history_month: FAIL ' . $e->getMessage() . "\n");
    exit(1);
}
