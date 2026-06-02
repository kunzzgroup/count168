<?php
/**
 * One-off diagnostic: delete after verifying production DB sees `groups`.
 */
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../includes/config.php';

if (!$pdo instanceof PDO) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'PDO not connected'], JSON_UNESCAPED_UNICODE);
    exit;
}

$out = ['ok' => true, 'database' => null, 'ap' => null, 'scope_columns' => []];

try {
    $out['database'] = $pdo->query('SELECT DATABASE()')->fetchColumn();
    $stmt = $pdo->prepare("SELECT id, group_code FROM `groups` WHERE group_code = 'AP' LIMIT 1");
    $stmt->execute();
    $out['ap'] = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

    foreach (['account_company', 'transactions'] as $table) {
        $col = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE 'scope_type'")->fetch(PDO::FETCH_ASSOC);
        $out['scope_columns'][$table] = $col ? true : false;
    }
} catch (Throwable $e) {
    http_response_code(500);
    $out['ok'] = false;
    $out['error'] = $e->getMessage();
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
