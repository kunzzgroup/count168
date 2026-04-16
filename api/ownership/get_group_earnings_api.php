<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

try {
    // Check and update schema: ignore or drop company_id
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_earnings_config (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(100) NOT NULL COMMENT 'Group ID',
            account_name VARCHAR(255) NOT NULL COMMENT 'Account display name',
            account_percentage DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT 'Account share %',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_group (group_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    try {
        $pdo->exec("ALTER TABLE group_earnings_config DROP COLUMN company_id");
    } catch (PDOException $e) {
        // Ignore if column doesn't exist
    }

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

    // Fetch all group equity configs
    $stmtEq = $pdo->query("SELECT group_id, equity_percentage FROM group_equity");
    $equities = $stmtEq->fetchAll(PDO::FETCH_ASSOC);

    $eqMap = [];
    foreach ($equities as $eq) {
        $eqMap[$eq['group_id']] = (float)$eq['equity_percentage'];
    }

    // Fetch all account configs
    $stmtAcc = $pdo->query("SELECT group_id, account_name, account_percentage FROM group_earnings_config ORDER BY id ASC");
    $accounts = $stmtAcc->fetchAll(PDO::FETCH_ASSOC);

    $accMap = [];
    foreach ($accounts as $acc) {
        $gid = $acc['group_id'];
        if (!isset($accMap[$gid])) {
            $accMap[$gid] = [];
        }
        $accMap[$gid][] = [
            'account_name' => $acc['account_name'],
            'account_percentage' => (float)$acc['account_percentage']
        ];
    }

    echo json_encode([
        'status' => 'success',
        'data' => [
            'equities' => $eqMap,
            'accounts' => $accMap
        ]
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
