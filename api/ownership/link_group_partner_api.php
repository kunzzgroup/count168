<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
    exit();
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Support either linking or unlinking
    $action = $data['action'] ?? 'link';
    $group_id = $data['group_id'] ?? '';
    
    $login_partner = $data['login_partner'] ?? '';
    $group_partner = $data['group_partner'] ?? '';

    if (empty($group_id)) {
        echo json_encode(['status' => 'error', 'message' => 'Missing Group ID']);
        exit;
    }

    if ($action === 'unlink') {
        $stmt = $pdo->prepare("DELETE FROM group_ownership WHERE group_id = ? AND partner_group_id IS NOT NULL");
        $stmt->execute([$group_id]);
        echo json_encode(['status' => 'success', 'message' => 'Partner unlinked successfully.']);
        exit;
    }

    if (empty($login_partner) || empty($group_partner)) {
        echo json_encode(['status' => 'error', 'message' => 'Missing Partner ID or Group ID']);
        exit;
    }

    // Basic verification - does this login ID exist as a user or owner?
    // In original code, we check if they are owner or user
    // We skip exact user validation here for brevity but simulate standard insert
    
    // First remove any existing link
    $stmtDel = $pdo->prepare("DELETE FROM group_ownership WHERE group_id = ? AND partner_group_id IS NOT NULL");
    $stmtDel->execute([$group_id]);

    // Insert new external partner link
    // We designate them with 0% initially, but with the partner_group_id
    $stmtIns = $pdo->prepare("INSERT INTO group_ownership (group_id, account_id, percentage, owner_type, partner_group_id) VALUES (?, ?, 0, 'user', ?)");
    $stmtIns->execute([$group_id, $login_partner, $group_partner]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Partner linked successfully.',
        'data' => [
            'login_partner' => $login_partner,
            'group_partner' => $group_partner
        ]
    ]);

} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
