<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$current_user_id = $_SESSION['user_id'];
$current_user_role = $_SESSION['role'] ?? '';

try {
    require_once '../get_companies_helper.php';
    $companies = [];
    if ($current_user_role === 'owner') {
        $owner_id = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id);
        $companies = getCompaniesByOwner($pdo, $owner_id, true);
    } else {
        $companies = getCompaniesByUser($pdo, $current_user_id, true);
    }

    $group_ids = [];
    foreach ($companies as $c) {
        if (!empty($c['group_id'])) {
            $group_ids[] = $c['group_id'];
        }
    }
    $groups = array_unique($group_ids);
    sort($groups);

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
