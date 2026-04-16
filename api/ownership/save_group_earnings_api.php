<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
    exit();
}

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$inputData = json_decode(file_get_contents('php://input'), true);

$group_id = $inputData['group_id'] ?? null;
$equity_percentage = isset($inputData['equity_percentage']) ? (float)$inputData['equity_percentage'] : null;
$accounts = $inputData['accounts'] ?? [];

if (!$group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
    exit();
}

if ($equity_percentage === null || $equity_percentage < 0 || $equity_percentage > 100) {
    echo json_encode(['status' => 'error', 'message' => 'Equity percentage must be between 0 and 100']);
    exit();
}

// Validate account percentages
$totalPct = 0;
foreach ($accounts as $acc) {
    $pct = (float)($acc['account_percentage'] ?? 0);
    if ($pct < 0 || $pct > 100) {
        echo json_encode(['status' => 'error', 'message' => 'Account percentage must be between 0 and 100']);
        exit();
    }
    $totalPct += $pct;
}

if ($totalPct > 100) {
    echo json_encode(['status' => 'error', 'message' => 'Total account percentage exceeds 100%']);
    exit();
}

try {
    $pdo->beginTransaction();

    // 1. Upsert Group equity percentage
    $owner_id = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);
    $stmtEquity = $pdo->prepare("
        INSERT INTO group_equity (group_id, equity_percentage, owner_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE equity_percentage = VALUES(equity_percentage), owner_id = VALUES(owner_id)
    ");
    $stmtEquity->execute([$group_id, $equity_percentage, $owner_id]);

    // 2. Delete all existing account configs for this group
    $stmtDelete = $pdo->prepare("DELETE FROM group_earnings_config WHERE group_id = ?");
    $stmtDelete->execute([$group_id]);

    // 3. Insert new account configs
    $stmtInsert = $pdo->prepare("
        INSERT INTO group_earnings_config (group_id, account_name, account_percentage)
        VALUES (?, ?, ?)
    ");

    foreach ($accounts as $acc) {
        $account_name = trim($acc['account_name'] ?? '');
        $account_percentage = (float)($acc['account_percentage'] ?? 0);
        if ($account_name === '' && $account_percentage <= 0) continue;
        
        $stmtInsert->execute([$group_id, $account_name, $account_percentage]);
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Group earnings configuration saved successfully'
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
