<?php
/**
 * Diagnostic: transaction maintenance search counts (delete after debugging).
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../includes/config.php';

if (!$pdo instanceof PDO) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'PDO not connected'], JSON_UNESCAPED_UNICODE);
    exit;
}

$companyCode = strtoupper(trim($_GET['code'] ?? '95'));
$groupId = strtoupper(trim($_GET['group'] ?? 'IG'));
$dateFrom = $_GET['date_from'] ?? '01/05/2026';
$dateTo = $_GET['date_to'] ?? '31/05/2026';

$tsFrom = strtotime(str_replace('/', '-', $dateFrom));
$tsTo = strtotime(str_replace('/', '-', $dateTo));
$dateFromDb = date('Y-m-d', $tsFrom);
$dateToDb = date('Y-m-d', $tsTo);

$stmt = $pdo->prepare("
    SELECT id, company_id, group_id
    FROM company
    WHERE UPPER(TRIM(company_id)) = ?
       OR (UPPER(TRIM(COALESCE(group_id, ''))) = ? AND TRIM(COALESCE(company_id, '')) <> '')
    ORDER BY id ASC
");
$stmt->execute([$companyCode, $groupId]);
$related = $stmt->fetchAll(PDO::FETCH_ASSOC);

$companyRow = null;
foreach ($related as $c) {
    if (strtoupper(trim($c['company_id'] ?? '')) === $companyCode) {
        $companyRow = $c;
        break;
    }
}

$entityStmt = $pdo->prepare("
    SELECT id, company_id, group_id FROM company
    WHERE UPPER(TRIM(company_id)) = ?
    LIMIT 1
");
$entityStmt->execute([$groupId]);
$entity = $entityStmt->fetch(PDO::FETCH_ASSOC) ?: null;

$out = [
    'ok' => true,
    'database' => $pdo->query('SELECT DATABASE()')->fetchColumn(),
    'date_range' => ['input' => [$dateFrom, $dateTo], 'db' => [$dateFromDb, $dateToDb]],
    'company_code' => $companyCode,
    'group_id' => $groupId,
    'company_row' => $companyRow,
    'group_entity' => $entity,
    'related_in_group' => $related,
];

if ($companyRow) {
    $cid = (int) $companyRow['id'];
    $tx = $pdo->prepare("
        SELECT COUNT(*) FROM transactions t
        WHERE t.company_id = ?
          AND t.transaction_date BETWEEN ? AND ?
          AND t.transaction_type NOT IN ('PAYMENT','RECEIVE','CONTRA','CLAIM','RATE','CLEAR','ADJUSTMENT','WIN','LOSE')
    ");
    $tx->execute([$cid, $dateFromDb, $dateToDb]);
    $cap = $pdo->prepare("
        SELECT COUNT(*) FROM data_captures dc
        INNER JOIN data_capture_details dcd ON dcd.capture_id = dc.id
        INNER JOIN process p ON dc.process_id = p.id
        WHERE dc.company_id = ? AND dcd.company_id = ?
          AND dc.capture_date BETWEEN ? AND ?
          AND UPPER(TRIM(p.process_id)) NOT IN ('SALARY','BONUS')
    ");
    $cap->execute([$cid, $cid, $dateFromDb, $dateToDb]);
    $capWithCurrency = $pdo->prepare("
        SELECT COUNT(*) FROM data_capture_details dcd
        INNER JOIN data_captures dc ON dcd.capture_id = dc.id
        INNER JOIN process p ON dc.process_id = p.id
        INNER JOIN currency c ON dcd.currency_id = c.id
        WHERE dc.company_id = ? AND dcd.company_id = ?
          AND dc.capture_date BETWEEN ? AND ?
    ");
    $capWithCurrency->execute([$cid, $cid, $dateFromDb, $dateToDb]);
    $capLeftCurrency = $pdo->prepare("
        SELECT COUNT(*) FROM data_capture_details dcd
        INNER JOIN data_captures dc ON dcd.capture_id = dc.id
        INNER JOIN process p ON dc.process_id = p.id
        LEFT JOIN currency c ON dcd.currency_id = c.id
        WHERE dc.company_id = ? AND dcd.company_id = ?
          AND dc.capture_date BETWEEN ? AND ?
    ");
    $capLeftCurrency->execute([$cid, $cid, $dateFromDb, $dateToDb]);
    $out['counts_company'] = [
        'transactions' => (int) $tx->fetchColumn(),
        'data_capture_details_excl_salary_bonus' => (int) $cap->fetchColumn(),
        'data_capture_with_inner_currency_join' => (int) $capWithCurrency->fetchColumn(),
        'data_capture_with_left_currency_join' => (int) $capLeftCurrency->fetchColumn(),
    ];
    $out['hint'] = [
        'numeric_company_id' => $cid,
        'api_must_use_company_id' => $cid,
        'category_bank_skips_data_capture' => true,
    ];
    $sample = $pdo->prepare("
        SELECT dc.id, dc.capture_date, p.process_id
        FROM data_captures dc
        INNER JOIN process p ON dc.process_id = p.id
        WHERE dc.company_id = ? AND dc.capture_date BETWEEN ? AND ?
        ORDER BY dc.capture_date DESC LIMIT 5
    ");
    $sample->execute([$cid, $dateFromDb, $dateToDb]);
    $out['sample_captures'] = $sample->fetchAll(PDO::FETCH_ASSOC);

    $roleStmt = $pdo->prepare("
        SELECT UPPER(TRIM(COALESCE(a.role, ''))) AS role, COUNT(DISTINCT a.id) AS cnt
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE ac.company_id = ?
        GROUP BY UPPER(TRIM(COALESCE(a.role, '')))
    ");
    $roleStmt->execute([$cid]);
    $out['account_roles'] = $roleStmt->fetchAll(PDO::FETCH_ASSOC);

    $expAccStmt = $pdo->prepare("
        SELECT a.id, a.account_id, a.name
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE ac.company_id = ? AND UPPER(TRIM(COALESCE(a.role, ''))) = 'EXPENSES'
        ORDER BY a.account_id ASC
        LIMIT 20
    ");
    $expAccStmt->execute([$cid]);
    $expAccounts = $expAccStmt->fetchAll(PDO::FETCH_ASSOC);
    $out['expenses_accounts'] = $expAccounts;

    if ($expAccounts) {
        $expIds = array_column($expAccounts, 'id');
        $ph = implode(',', array_fill(0, count($expIds), '?'));
        $capExp = $pdo->prepare("
            SELECT COALESCE(SUM(dcd.processed_amount), 0)
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dc.company_id = ? AND dcd.company_id = ?
              AND dcd.account_id IN ($ph)
              AND dc.capture_date BETWEEN ? AND ?
        ");
        $capExp->execute(array_merge([$cid, $cid], $expIds, [$dateFromDb, $dateToDb]));
        $out['expenses_capture_sum'] = (string) $capExp->fetchColumn();
    } else {
        $out['expenses_capture_sum'] = '0';
        $out['expenses_hint'] = 'No EXPENSES role accounts linked to this company — dashboard Expenses card will always be 0.';
    }
}

if ($entity) {
    $eid = (int) $entity['id'];
    $capG = $pdo->prepare("
        SELECT COUNT(*) FROM data_captures dc
        INNER JOIN data_capture_details dcd ON dcd.capture_id = dc.id
        INNER JOIN process p ON dc.process_id = p.id
        WHERE dc.company_id = ? AND dcd.company_id = ?
          AND dc.capture_date BETWEEN ? AND ?
          AND UPPER(TRIM(p.process_id)) IN ('SALARY','BONUS')
    ");
    $capG->execute([$eid, $eid, $dateFromDb, $dateToDb]);
    $out['counts_group_entity'] = ['salary_bonus_captures' => (int) $capG->fetchColumn()];
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
