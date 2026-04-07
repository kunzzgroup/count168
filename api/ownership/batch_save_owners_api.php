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

/**
 * Expected JSON payload:
 * {
 *   "company_id": "1",
 *   "owners": [
 *     {"account_id": "U_3", "percentage": 50},
 *     {"account_id": "A_5", "percentage": 30}
 *   ]
 * }
 */
$inputData = json_decode(file_get_contents('php://input'), true);

$company_id = $inputData['company_id'] ?? null;
$owners = $inputData['owners'] ?? [];

if (!$company_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing company_id']);
    exit();
}

// Validate total percentage
$total_percentage = 0;
foreach ($owners as $owner) {
    if (!isset($owner['account_id']) || !isset($owner['percentage'])) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid owner data format']);
        exit();
    }
    $pct = (float)$owner['percentage'];
    if ($pct <= 0 || $pct > 100) {
        echo json_encode(['status' => 'error', 'message' => 'Percentage must be between 0 and 100']);
        exit();
    }
    $total_percentage += $pct;
}

if ($total_percentage > 100) {
    echo json_encode(['status' => 'error', 'message' => 'Total allocation exceeds 100%']);
    exit();
}

$hasOwnerType = $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'")->rowCount() > 0;

try {
    $pdo->beginTransaction();

    // Preserve existing partner_group_id
    $existingGroups = [];
    $stmtGroups = $pdo->prepare("SELECT account_id, partner_group_id FROM company_ownership WHERE company_id = ? AND owner_type = 'owner'");
    $stmtGroups->execute([$company_id]);
    while ($row = $stmtGroups->fetch(PDO::FETCH_ASSOC)) {
        $existingGroups[$row['account_id']] = $row['partner_group_id'];
    }

    // Remove all existing owners for this company
    $stmt = $pdo->prepare("DELETE FROM company_ownership WHERE company_id = ?");
    $stmt->execute([$company_id]);

    // Insert new owners
    if (count($owners) > 0) {
        if ($hasOwnerType) {
            $insertStmt = $pdo->prepare("
                INSERT INTO company_ownership (company_id, account_id, owner_type, percentage, partner_group_id)
                VALUES (?, ?, ?, ?, ?)
            ");
        } else {
            $insertStmt = $pdo->prepare("
                INSERT INTO company_ownership (company_id, account_id, percentage)
                VALUES (?, ?, ?)
            ");
        }
        
        foreach ($owners as $owner) {
            $raw_id = (string)$owner['account_id'];
            $owner_type = 'account'; // default
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
                $pgid = null;
                if ($owner_type === 'owner' && isset($existingGroups[(int)$real_id])) {
                    $pgid = $existingGroups[(int)$real_id];
                }
                $insertStmt->execute([$company_id, (int)$real_id, $owner_type, (float)$owner['percentage'], $pgid]);
            } else {
                // If migration hasn't run, we must drop Users so it doesn't crash, or attempt.
                // In a perfect world, migration is run first. If not, only save numbers.
                $insertStmt->execute([$company_id, (int)$real_id, (float)$owner['percentage']]);
            }
        }
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Ownership saved successfully'
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
