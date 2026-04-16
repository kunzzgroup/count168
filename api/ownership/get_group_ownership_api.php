<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

try {
    // 1. Create table if not exists
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_ownership (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(100) NOT NULL COMMENT 'Group ID',
            account_id VARCHAR(100) DEFAULT NULL COMMENT 'Account ID (O_id or U_id)',
            percentage DECIMAL(10,4) NOT NULL DEFAULT 0,
            owner_type ENUM('owner', 'user') NOT NULL DEFAULT 'user',
            partner_group_id VARCHAR(100) DEFAULT NULL COMMENT 'For External Partner',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_group (group_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_equity (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(100) NOT NULL UNIQUE COMMENT 'Group ID',
            equity_percentage DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT 'Group equity %',
            owner_id INT NOT NULL COMMENT 'Owner who created this config',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // 2. Fetch equities
    $stmtEq = $pdo->query("SELECT group_id, equity_percentage FROM group_equity");
    $equities = $stmtEq->fetchAll(PDO::FETCH_ASSOC);
    $eqMap = [];
    foreach ($equities as $eq) {
        $eqMap[$eq['group_id']] = (float)$eq['equity_percentage'];
    }

    // 3. Fetch ownership accounts for groups
    $stmtAcc = $pdo->query("SELECT * FROM group_ownership ORDER BY id ASC");
    $accounts = $stmtAcc->fetchAll(PDO::FETCH_ASSOC);

    // Group the accounts by group_id
    $groupData = [];
    
    // Default structure for every group
    // In actual JS we iterate over frontend active groups, but sending all saved ones here
    foreach ($accounts as $acc) {
        $gid = $acc['group_id'];
        if (!isset($groupData[$gid])) {
            $groupData[$gid] = [
                'accounts' => [],
                'external_partner' => null
            ];
        }

        if ($acc['partner_group_id']) {
            $groupData[$gid]['external_partner'] = [
                'login_partner' => $acc['account_id'],
                'group_partner' => $acc['partner_group_id'],
                'percentage' => (float)$acc['percentage']
            ];
        } else {
            $groupData[$gid]['accounts'][] = [
                'id' => $acc['account_id'],
                'type' => $acc['owner_type'],
                'percentage' => (float)$acc['percentage']
            ];
        }
    }

    echo json_encode([
        'status' => 'success',
        'data' => [
            'equities' => $eqMap,
            'groups' => $groupData
        ]
    ]);

} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
