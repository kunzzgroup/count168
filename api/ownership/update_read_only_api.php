<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true);
$user_id  = isset($data['user_id'])  ? (int)$data['user_id']  : null;
$read_only = isset($data['read_only']) ? (int)$data['read_only'] : null;

if (!$user_id || $read_only === null) {
    echo json_encode(['status' => 'error', 'message' => 'Missing parameters']);
    exit();
}

try {
    // Verify target user is Partnership role before updating
    $check = $pdo->prepare("SELECT id FROM user WHERE id = ? AND role = 'Partnership'");
    $check->execute([$user_id]);
    if (!$check->fetch()) {
        echo json_encode(['status' => 'error', 'message' => 'Not a Partnership user']);
        exit();
    }

    $stmt = $pdo->prepare("UPDATE user SET read_only = ? WHERE id = ?");
    $stmt->execute([$read_only, $user_id]);

    echo json_encode(['status' => 'success', 'message' => 'Read-only status updated']);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'DB error: ' . $e->getMessage()]);
}
?>
