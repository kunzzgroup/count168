<?php
/**
 * Diagnostic: dashboard EXPENSES accounts + period totals (delete after debugging).
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/permissions.php';

if (!$pdo instanceof PDO) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'PDO not connected'], JSON_UNESCAPED_UNICODE);
    exit;
}

$companyCode = strtoupper(trim($_GET['code'] ?? '95'));
$groupId = strtoupper(trim($_GET['group'] ?? 'IG'));
$dateFrom = $_GET['date_from'] ?? '2026-01-01';
$dateTo = $_GET['date_to'] ?? '2026-06-02';
$currency = strtoupper(trim($_GET['currency'] ?? 'MYR'));

$stmt = $pdo->prepare('SELECT id, company_id, group_id FROM company WHERE UPPER(TRIM(company_id)) = ? LIMIT 1');
$stmt->execute([$companyCode]);
$companyRow = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$companyRow) {
    echo json_encode(['ok' => false, 'error' => 'Company not found', 'code' => $companyCode], JSON_UNESCAPED_UNICODE);
    exit;
}

$cid = (int) $companyRow['id'];

$entityStmt = $pdo->prepare('SELECT id, company_id FROM company WHERE UPPER(TRIM(company_id)) = ? LIMIT 1');
$entityStmt->execute([$groupId]);
$entity = $entityStmt->fetch(PDO::FETCH_ASSOC) ?: null;

function probeExpensesAccounts(PDO $pdo, int $companyId, string $role): array
{
    $sql = "SELECT DISTINCT a.id, a.account_id, a.name, a.role
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE ac.company_id = ?
              AND UPPER(TRIM(COALESCE(a.role, ''))) = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId, $role]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function probeRoleCaptureSum(PDO $pdo, int $companyId, array $accountIds, string $dateFrom, string $dateTo, ?int $currencyId): string
{
    if (!$accountIds) {
        return '0';
    }
    $ph = implode(',', array_fill(0, count($accountIds), '?'));
    $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0)
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dc.company_id = ? AND dcd.company_id = ?
              AND dcd.account_id IN ($ph)
              AND dc.capture_date BETWEEN ? AND ?";
    $params = array_merge([$companyId, $companyId], $accountIds, [$dateFrom, $dateTo]);
    if ($currencyId !== null) {
        $sql .= ' AND dcd.currency_id = ?';
        $params[] = $currencyId;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (string) $stmt->fetchColumn();
}

$curStmt = $pdo->prepare('SELECT id FROM currency WHERE company_id = ? AND UPPER(code) = ? LIMIT 1');
$curStmt->execute([$cid, $currency]);
$myrId = $curStmt->fetchColumn();
$myrId = $myrId !== false ? (int) $myrId : null;

$roles = ['PROFIT', 'EXPENSES', 'CAPITAL'];
$byCompany = [];
foreach ($roles as $role) {
    $accounts = probeExpensesAccounts($pdo, $cid, $role);
    $ids = array_column($accounts, 'id');
    $byCompany[$role] = [
        'account_count' => count($accounts),
        'accounts' => array_slice($accounts, 0, 10),
        'capture_sum_myr' => probeRoleCaptureSum($pdo, $cid, $ids, $dateFrom, $dateTo, $myrId),
        'capture_sum_all_currency' => probeRoleCaptureSum($pdo, $cid, $ids, $dateFrom, $dateTo, null),
    ];
}

$byEntity = null;
if ($entity) {
    $eid = (int) $entity['id'];
    $byEntity = [];
    foreach ($roles as $role) {
        $accounts = probeExpensesAccounts($pdo, $eid, $role);
        $ids = array_column($accounts, 'id');
        $entMyrStmt = $pdo->prepare('SELECT id FROM currency WHERE company_id = ? AND UPPER(code) = ? LIMIT 1');
        $entMyrStmt->execute([$eid, $currency]);
        $entMyrId = $entMyrStmt->fetchColumn();
        $entMyrId = $entMyrId !== false ? (int) $entMyrId : null;
        $byEntity[$role] = [
            'account_count' => count($accounts),
            'accounts' => array_slice($accounts, 0, 10),
            'capture_sum_myr' => probeRoleCaptureSum($pdo, $eid, $ids, $dateFrom, $dateTo, $entMyrId),
        ];
    }
}

define('DASHBOARD_API_SKIP_MAIN', true);
require_once __DIR__ . '/../transactions/dashboard_api.php';
$_GET = [
    'date_from' => $dateFrom,
    'date_to' => $dateTo,
    'company_id' => (string) $cid,
    'currency' => $currency,
    'view_group' => $groupId,
];
$_SESSION['user_id'] = $_SESSION['user_id'] ?? 1;
$_SESSION['role'] = $_SESSION['role'] ?? 'owner';

$apiJson = dashboard_api_capture($_GET);

echo json_encode([
    'ok' => true,
    'database' => $pdo->query('SELECT DATABASE()')->fetchColumn(),
    'date_range' => [$dateFrom, $dateTo],
    'currency' => $currency,
    'company' => $companyRow,
    'group_entity' => $entity,
    'roles_on_company' => $byCompany,
    'roles_on_group_entity' => $byEntity,
    'dashboard_api' => [
        'success' => $apiJson['success'] ?? false,
        'period_profit' => $apiJson['data']['period_total']['profit'] ?? null,
        'period_expenses' => $apiJson['data']['period_total']['expenses'] ?? null,
        'message' => $apiJson['message'] ?? null,
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
