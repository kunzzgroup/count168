<?php
/**
 * Seed April 2026 ownership history (CLI, run on server).
 *   php database/ops/seed_april_ownership_sample.php
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once dirname(__DIR__, 2) . '/includes/config.php';
require_once dirname(__DIR__, 2) . '/api/includes/ownership_history.php';

$sqlFile = __DIR__ . '/seed_april_ownership_sample.sql';
if (!is_readable($sqlFile)) {
    fwrite(STDERR, "Missing {$sqlFile}\n");
    exit(1);
}

ownership_history_ensure_tables($pdo);

$raw = file_get_contents($sqlFile);
// Strip block comments and line comments; split on semicolon
$raw = preg_replace('/--[^\r\n]*/', '', $raw);
$statements = array_filter(array_map('trim', explode(';', $raw)));

try {
    foreach ($statements as $stmt) {
        if ($stmt === '') {
            continue;
        }
        $pdo->exec($stmt);
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'FAIL: ' . $e->getMessage() . "\n");
    exit(1);
}

$rows = $pdo->query("
    SELECT c.company_id AS name, h.owner_type, h.account_id, h.percentage, h.saved_at
    FROM company_ownership_history h
    JOIN company c ON c.id = h.company_id
    WHERE h.effective_month = '2026-04-01'
    ORDER BY c.company_id, h.percentage DESC
")->fetchAll(PDO::FETCH_ASSOC);

if (count($rows) === 0) {
    fwrite(STDERR, "Done but 0 April rows — check company_ownership has data.\n");
    exit(1);
}

echo "OK: April 2026 sample seeded\n";
foreach ($rows as $r) {
    echo sprintf(
        "  %s | %s #%s = %s%% | saved %s\n",
        $r['name'],
        $r['owner_type'],
        $r['account_id'],
        $r['percentage'],
        $r['saved_at']
    );
}
