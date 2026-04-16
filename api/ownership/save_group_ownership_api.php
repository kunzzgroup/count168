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

try {
    $inputData = json_decode(file_get_contents('php://input'), true);
    
    $group_id = $inputData['group_id'] ?? null;
    $equity_percentage = isset($inputData['equity_percentage']) ? (float)$inputData['equity_percentage'] : 0;
    $accounts = $inputData['accounts'] ?? [];

    if (!$group_id) {
        echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
        exit();
    }

    $pdo->beginTransaction();

    // 1. Upsert Equity
    $owner_id = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);
    $stmtEquity = $pdo->prepare("
        INSERT INTO group_equity (group_id, equity_percentage, owner_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE equity_percentage = VALUES(equity_percentage), owner_id = VALUES(owner_id)
    ");
    $stmtEquity->execute([$group_id, $equity_percentage, $owner_id]);

    // 2. Delete existing accounts (keep external partner if we modify only accounts? Or overwrite all?)
    // In standard Account Ownership, saving overwrites standard accounts, but leaves partner alone unless explicitly removed.
    // Let's delete ONLY non-partner accounts
    $stmtDel = $pdo->prepare("DELETE FROM group_ownership WHERE group_id = ? AND partner_group_id IS NULL");
    $stmtDel->execute([$group_id]);

    // 3. Insert specific accounts
    if (is_array($accounts)) {
        $stmtInsert = $pdo->prepare("INSERT INTO group_ownership (group_id, account_id, percentage, owner_type) VALUES (?, ?, ?, ?)");
        foreach ($accounts as $acc) {
            $rawId = $acc['account_id'] ?? '';
            $pct = (float)($acc['percentage'] ?? 0);
            
            if (!$rawId || $pct <= 0) continue;

            $type = 'user';
            $dbId = $rawId;
            if (strpos($rawId, 'O_') === 0) {
                $type = 'owner';
                $dbId = substr($rawId, 2);
            } elseif (strpos($rawId, 'U_') === 0) {
                $type = 'user';
                $dbId = substr($rawId, 2);
            }

            $stmtInsert->execute([$group_id, $dbId, $pct, $type]);
        }
    }

    $pdo->commit();

    echo json_encode(['status' => 'success', 'message' => 'Group configuration saved successfully.']);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
