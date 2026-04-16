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
$owners = $inputData['owners'] ?? [];

if (!$group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
    exit();
}

$total_percentage = 0;
foreach ($owners as $owner) {
    if (!isset($owner['account_id']) || !isset($owner['percentage'])) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid owner data format']);
        exit();
    }
    $pct = (float)$owner['percentage'];
    if ($pct < 0 || $pct > 100) {
        echo json_encode(['status' => 'error', 'message' => 'Percentage must be between 0 and 100']);
        exit();
    }
    $total_percentage += $pct;
}

if ($total_percentage > 100) {
    echo json_encode(['status' => 'error', 'message' => 'Total allocation exceeds 100%']);
    exit();
}

$hasOwnerType = $pdo->query("SHOW COLUMNS FROM group_earnings_allocation LIKE 'owner_type'")->rowCount() > 0;

try {
    $pdo->beginTransaction();

    // Verify group exists in company_ownership
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM company_ownership WHERE entity_type = 'group' AND group_id = ?");
    $stmt->execute([$group_id]);
    if ($stmt->fetchColumn() == 0) {
        throw new Exception("Group ID does not exist in any ownership records.");
    }

    $stmt = $pdo->prepare("DELETE FROM group_earnings_allocation WHERE group_id = ?");
    $stmt->execute([$group_id]);

    if (count($owners) > 0) {
        if ($hasOwnerType) {
            $insertStmt = $pdo->prepare("
                INSERT INTO group_earnings_allocation (group_id, account_id, owner_type, percentage)
                VALUES (?, ?, ?, ?)
            ");
        } else {
            $insertStmt = $pdo->prepare("
                INSERT INTO group_earnings_allocation (group_id, account_id, percentage)
                VALUES (?, ?, ?)
            ");
        }
        
        foreach ($owners as $owner) {
            $raw_id = (string)$owner['account_id'];
            $owner_type = 'account';
            $real_id = $raw_id;

            if (strpos($raw_id, 'O_') === 0) {
                $owner_type = 'owner';
                $real_id = substr($raw_id, 2);
            } elseif (strpos($raw_id, 'U_') === 0) {
                $owner_type = 'user';
                $real_id = substr($raw_id, 2);
            } elseif (strpos($raw_id, 'A_') === 0) {
                $owner_type = 'account';
                $real_id = substr($raw_id, 2);
            }

            if ($hasOwnerType) {
                $insertStmt->execute([$group_id, (int)$real_id, $owner_type, (float)$owner['percentage']]);
            } else {
                $insertStmt->execute([$group_id, (int)$real_id, (float)$owner['percentage']]);
            }
        }
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Group allocation saved successfully'
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'status' => 'error',
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}
?>
