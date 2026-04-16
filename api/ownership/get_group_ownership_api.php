<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

try {
    // 1. Fetch distinct group_ids from company table
    $stmtGroups = $pdo->query("SELECT DISTINCT group_id FROM company WHERE group_id IS NOT NULL AND TRIM(group_id) != '' ORDER BY group_id ASC");
    $groups = $stmtGroups->fetchAll(PDO::FETCH_COLUMN);

    // 2. Fetch group equities
    $stmtEquity = $pdo->query("SELECT group_id, equity_percentage FROM group_equity");
    $equities = [];
    while ($row = $stmtEquity->fetch(PDO::FETCH_ASSOC)) {
        $equities[$row['group_id']] = (float)$row['equity_percentage'];
    }

    // 3. Fetch group earnings configs (accounts)
    $stmtConfig = $pdo->query("SELECT group_id, account_name, account_percentage FROM group_earnings_config");
    $configs = [];
    while ($row = $stmtConfig->fetch(PDO::FETCH_ASSOC)) {
        $gid = $row['group_id'];
        if (!isset($configs[$gid])) {
            $configs[$gid] = [];
        }
        $configs[$gid][] = [
            'account_id' => $row['account_name'], // the frontend uses account_id for the select box value
            'percentage' => (float)$row['account_percentage']
        ];
    }

    $data = [];
    foreach ($groups as $group_id) {
        $data[] = [
            'group_id' => $group_id,
            'equity_percentage' => $equities[$group_id] ?? 0.0,
            'accounts' => $configs[$group_id] ?? []
        ];
    }

    echo json_encode([
        'status' => 'success',
        'data' => $data
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
