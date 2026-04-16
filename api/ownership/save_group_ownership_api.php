<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);
$group_id = $input['group_id'] ?? null;
$equity_percentage = isset($input['equity_percentage']) ? (float)$input['equity_percentage'] : null;
$accounts = $input['accounts'] ?? []; 

if (!$group_id || $equity_percentage === null) {
    echo json_encode(['status' => 'error', 'message' => 'Missing required fields']);
    exit();
}

if ($equity_percentage < 0 || $equity_percentage > 100) {
    echo json_encode(['status' => 'error', 'message' => 'Group Equity % must be between 0 and 100']);
    exit();
}

$owner_id = $_SESSION['user_id'];

try {
    $pdo->beginTransaction();

    // Check if group_equity exists for this group_id
    $stmtCheck = $pdo->prepare("SELECT id FROM group_equity WHERE group_id = ?");
    $stmtCheck->execute([$group_id]);
    $existingId = $stmtCheck->fetchColumn();

    if ($existingId) {
        $stmtUpdateEq = $pdo->prepare("UPDATE group_equity SET equity_percentage = ?, owner_id = ?, updated_at = NOW() WHERE id = ?");
        $stmtUpdateEq->execute([$equity_percentage, $owner_id, $existingId]);
    } else {
        $stmtInsertEq = $pdo->prepare("INSERT INTO group_equity (group_id, equity_percentage, owner_id) VALUES (?, ?, ?)");
        $stmtInsertEq->execute([$group_id, $equity_percentage, $owner_id]);
    }

    // Replace all accounts for this group
    $stmtDelete = $pdo->prepare("DELETE FROM group_earnings_config WHERE group_id = ?");
    $stmtDelete->execute([$group_id]);

    if (!empty($accounts)) {
        $stmtInsertAcc = $pdo->prepare("INSERT INTO group_earnings_config (group_id, account_name, account_percentage) VALUES (?, ?, ?)");
        // Sum total to validate
        $total_account_pct = 0;
        foreach ($accounts as $acc) {
            $acc_pct = (float)$acc['percentage'];
            $total_account_pct += $acc_pct;
            $stmtInsertAcc->execute([$group_id, $acc['account_id'], $acc_pct]);
        }
        
        if ($total_account_pct > 100) {
            throw new Exception("Total account percentage cannot exceed 100%");
        }
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Group earnings configuration saved successfully'
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>
