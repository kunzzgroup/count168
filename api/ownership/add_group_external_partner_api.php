<?php
/**
 * Group Earnings API — Add External Partner to a group
 * POST body: { "group_id": "AP", "login_id": "JK123", "force_type": "" }
 */
session_start();
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'status' => 'error', 'message' => 'Unauthorized']);
    exit();
}
session_write_close();

$data = json_decode(file_get_contents('php://input'), true);
$group_id        = trim($data['group_id'] ?? '');
$login_or_group_id = trim($data['login_id'] ?? '');
$force_type      = trim($data['force_type'] ?? '');

if (!$group_id || !$login_or_group_id) {
    echo json_encode([
        'success' => false,
        'status' => 'error',
        'message' => 'Group ID and Login ID/Group ID are required'
    ]);
    exit();
}

// Auto-create table
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_ownership (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(50) NOT NULL,
            owner_id INT NOT NULL,
            account_id INT NOT NULL,
            owner_type ENUM('owner','user') NOT NULL DEFAULT 'owner',
            percentage DECIMAL(6,2) NOT NULL DEFAULT 0.00,
            partner_group_id VARCHAR(50) DEFAULT NULL,
            read_only TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_group_account (group_id, account_id, owner_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
} catch (Exception $e) {}

try {
    $currentOwnerId = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);
    $normalizedInput = strtoupper(preg_replace('/\s+/', '', $login_or_group_id));

    // 1. Check for Login ID (owner_code) match
    $partnerByLogin = null;
    if ($force_type === '' || $force_type === 'login') {
        $stmtLogin = $pdo->prepare("
            SELECT id, name, owner_code
            FROM owner
            WHERE UPPER(REPLACE(TRIM(owner_code), ' ', '')) = ?
              AND id != ?
              AND status = 'active'
            LIMIT 1
        ");
        $stmtLogin->execute([$normalizedInput, $currentOwnerId]);
        $partnerByLogin = $stmtLogin->fetch(PDO::FETCH_ASSOC);
    }

    // 2. Check for Group ID match
    $partnerByGroup = null;
    if ($force_type === '' || $force_type === 'group') {
        $stmtGrp = $pdo->prepare("
            SELECT o.id, o.name, c.group_id 
            FROM company c
            JOIN owner o ON c.owner_id = o.id
            WHERE UPPER(REPLACE(TRIM(c.group_id), ' ', '')) = ?
              AND o.id != ?
              AND o.status = 'active'
              AND c.status = 'active'
            LIMIT 1
        ");
        $stmtGrp->execute([$normalizedInput, $currentOwnerId]);
        $partnerByGroup = $stmtGrp->fetch(PDO::FETCH_ASSOC);
    }

    $partner = null;
    $matched_by_group = null;

    if ($partnerByLogin && $partnerByGroup) {
        echo json_encode([
            'success' => false,
            'status'  => 'conflict',
            'message' => 'Multiple matches found.',
            'data'    => [
                'login_partner' => $partnerByLogin['name'] . ' (' . $partnerByLogin['owner_code'] . ')',
                'group_partner' => $partnerByGroup['name'] . ' (Group: ' . $partnerByGroup['group_id'] . ')'
            ]
        ]);
        exit();
    } elseif ($partnerByGroup) {
        $partner = $partnerByGroup;
        $matched_by_group = strtoupper($login_or_group_id);
    } elseif ($partnerByLogin) {
        $partner = $partnerByLogin;
    }

    if (!$partner) {
        // Give a clearer reason when user enters their own group ID.
        $stmtOwnGroup = $pdo->prepare("
            SELECT 1
            FROM company
            WHERE owner_id = ?
              AND UPPER(REPLACE(TRIM(group_id), ' ', '')) = ?
              AND status = 'active'
            LIMIT 1
        ");
        $stmtOwnGroup->execute([$currentOwnerId, $normalizedInput]);
        if ($stmtOwnGroup->fetchColumn()) {
            echo json_encode([
                'success' => false,
                'status' => 'error',
                'message' => 'Cannot link your own Group ID as an external partner'
            ]);
            exit();
        }

        echo json_encode([
            'success' => false,
            'status' => 'error',
            'message' => 'Owner account or Group ID not found or inactive'
        ]);
        exit();
    }

    $partnerId = $partner['id'];

    if ($currentOwnerId == $partnerId) {
        echo json_encode([
            'success' => false,
            'status' => 'error',
            'message' => 'Cannot link yourself as an external partner'
        ]);
        exit();
    }

    // Check if already linked in this group
    $stmtLink = $pdo->prepare("SELECT id FROM group_ownership WHERE group_id = ? AND owner_type = 'owner' AND account_id = ?");
    $stmtLink->execute([$group_id, $partnerId]);
    if ($stmtLink->fetch()) {
        echo json_encode([
            'success' => false,
            'status' => 'error',
            'message' => 'Partner is already linked to this group'
        ]);
        exit();
    }

    // Insert 0% entry
    $stmtInsert = $pdo->prepare("INSERT INTO group_ownership (group_id, owner_id, account_id, owner_type, percentage, partner_group_id) VALUES (?, ?, ?, 'owner', 0, ?)");
    $stmtInsert->execute([$group_id, $currentOwnerId, $partnerId, $matched_by_group]);

    echo json_encode([
        'success' => true,
        'status'  => 'success',
        'message' => "Partner '{$partner['name']}' linked to group '{$group_id}' successfully",
        'data' => [
            'group_id' => $group_id,
            'partner_id' => (int)$partnerId,
            'partner_name' => $partner['name']
        ]
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
