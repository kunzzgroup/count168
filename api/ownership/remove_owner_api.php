<?php
require_once '../../includes/session_check.php';
require_once '../../includes/config.php';
require_once __DIR__ . '/../deleted_log/deleted_log.php';
require_once '../includes/ownership_history.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
    exit();
}

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$ownership_id = $_POST['ownership_id'] ?? null;

if (!$ownership_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing ownership_id']);
    exit();
}

try {
    $stmtLookup = $pdo->prepare('SELECT company_id FROM company_ownership WHERE id = ?');
    $stmtLookup->execute([$ownership_id]);
    $companyId = (int) $stmtLookup->fetchColumn();

    deletedLog(
        $pdo,
        (string) ($_SESSION['login_id'] ?? $_SESSION['name'] ?? ''),
        basename(__FILE__),
        'company_ownership',
        (string) $ownership_id
    );
    $stmt = $pdo->prepare("DELETE FROM company_ownership WHERE id = ?");
    $stmt->execute([$ownership_id]);

    if ($companyId > 0) {
        $savedBy = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
        ownership_history_snapshot_company_from_live($pdo, $companyId, $savedBy);
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'Owner removed successfully'
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
