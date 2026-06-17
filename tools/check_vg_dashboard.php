<?php
require __DIR__ . '/../includes/config.php';
if (!$pdo) {
    fwrite(STDERR, "DB connection failed\n");
    exit(1);
}

$dateFrom = '2026-06-01';
$dateTo = '2026-06-17';

echo "=== VG company rows ===\n";
$stmt = $pdo->query("SELECT id, company_id, group_id, status, owner_type FROM company WHERE UPPER(TRIM(company_id)) = 'VG' ORDER BY id");
$vgRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
print_r($vgRows);

$vgId = (int) ($vgRows[0]['id'] ?? 0);
echo "\n=== IG group companies ===\n";
$stmt = $pdo->query("SELECT id, company_id, group_id, owner_type FROM company WHERE UPPER(TRIM(group_id)) = 'IG' ORDER BY company_id");
$igRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
print_r($igRows);

$igEntityId = 0;
foreach ($igRows as $r) {
    if (strtoupper(trim((string) $r['company_id'])) === 'IG') {
        $igEntityId = (int) $r['id'];
        break;
    }
}
echo "\nIG entity company id: $igEntityId\n";
echo "VG company id: $vgId\n";

if ($vgId <= 0) {
    exit(0);
}

// MYR currency id for VG
$curStmt = $pdo->prepare("SELECT id FROM currency WHERE company_id = ? AND UPPER(code) = 'MYR' LIMIT 1");
$curStmt->execute([$vgId]);
$myrId = (int) ($curStmt->fetchColumn() ?: 0);
echo "VG MYR currency id: $myrId\n";

// EXPENSES accounts on VG
echo "\n=== EXPENSES accounts on VG (company_id=$vgId) ===\n";
$accStmt = $pdo->prepare("
    SELECT DISTINCT a.id, a.account_id, a.name, a.role
    FROM account a
    INNER JOIN account_company ac ON a.id = ac.account_id
    WHERE ac.company_id = ?
      AND UPPER(TRIM(COALESCE(a.role,''))) IN ('EXPENSES','EXPENSE')
    ORDER BY a.account_id
    LIMIT 20
");
$accStmt->execute([$vgId]);
$vgAccounts = $accStmt->fetchAll(PDO::FETCH_ASSOC);
print_r($vgAccounts);

// EXPENSES accounts on IG entity
if ($igEntityId > 0) {
    echo "\n=== EXPENSES accounts on IG entity (company_id=$igEntityId) ===\n";
    $accStmt->execute([$igEntityId]);
    $igAccounts = $accStmt->fetchAll(PDO::FETCH_ASSOC);
    print_r($igAccounts);
}

// Transactions on VG ledger in date range (MYR)
if ($myrId > 0) {
    echo "\n=== VG transactions ($dateFrom to $dateTo) MYR by type ===\n";
    $txnStmt = $pdo->prepare("
        SELECT transaction_type, COUNT(*) cnt, SUM(amount) total
        FROM transactions
        WHERE company_id = ?
          AND currency_id = ?
          AND transaction_date BETWEEN ? AND ?
        GROUP BY transaction_type
        ORDER BY cnt DESC
    ");
    $txnStmt->execute([$vgId, $myrId, $dateFrom, $dateTo . ' 23:59:59']);
    print_r($txnStmt->fetchAll(PDO::FETCH_ASSOC));

    echo "\n=== VG PAYMENT/RECEIVE sample (expenses-related) ===\n";
    $sample = $pdo->prepare("
        SELECT id, transaction_date, transaction_type, amount, account_id, from_account_id, description
        FROM transactions
        WHERE company_id = ?
          AND currency_id = ?
          AND transaction_date BETWEEN ? AND ?
          AND transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLAIM','WIN','LOSE')
        ORDER BY transaction_date DESC
        LIMIT 10
    ");
    $sample->execute([$vgId, $myrId, $dateFrom, $dateTo . ' 23:59:59']);
    print_r($sample->fetchAll(PDO::FETCH_ASSOC));
}

// Data capture on VG
echo "\n=== Data captures on VG in range ===\n";
$dcStmt = $pdo->prepare("
    SELECT dc.id, dc.capture_date, COUNT(dcd.id) detail_cnt, SUM(dcd.processed_value) total_val
    FROM data_captures dc
    LEFT JOIN data_capture_details dcd ON dcd.capture_id = dc.id
    WHERE dc.company_id = ?
      AND dc.capture_date BETWEEN ? AND ?
    GROUP BY dc.id, dc.capture_date
    ORDER BY dc.capture_date
    LIMIT 20
");
$dcStmt->execute([$vgId, $dateFrom, $dateTo]);
print_r($dcStmt->fetchAll(PDO::FETCH_ASSOC));

// Check if VG has PROFIT accounts / transactions
echo "\n=== PROFIT accounts on VG ===\n";
$profitStmt = $pdo->prepare("
    SELECT COUNT(*) FROM account a
    INNER JOIN account_company ac ON a.id = ac.account_id
    WHERE ac.company_id = ? AND UPPER(TRIM(a.role)) = 'PROFIT'
");
$profitStmt->execute([$vgId]);
echo 'count: ' . $profitStmt->fetchColumn() . "\n";
