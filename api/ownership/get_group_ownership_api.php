<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

try {
    // 1. Check if entity_type exists
    $hasEntityType = $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'entity_type'")->rowCount() > 0;
    
    $groups = [];
    if ($hasEntityType) {
        $stmt = $pdo->query("
            SELECT DISTINCT group_id 
            FROM company_ownership 
            WHERE entity_type = 'group' AND group_id IS NOT NULL AND group_id != ''
        ");
        $groups = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    $response = [
        'groups' => [],
        'equities' => []
    ];

    // Get equity allocations per group
    if (count($groups) > 0) {
        $hasOwnerType = $pdo->query("SHOW COLUMNS FROM group_earnings_allocation LIKE 'owner_type'")->rowCount() > 0;
        
        foreach ($groups as $group_id) {
            $response['groups'][$group_id] = [
                'id' => $group_id,
                'name' => $group_id,
                'group_id' => $group_id,
                'allocated_percentage' => 0
            ];

            if ($hasOwnerType) {
                // Fetch group members details similar to get_owners_api.php
                $gStmt = $pdo->prepare("
                    SELECT gea.id as ownership_id, gea.percentage, gea.owner_type,
                           CONCAT(
                               CASE 
                                   WHEN gea.owner_type = 'owner' THEN 'O_'
                                   WHEN gea.owner_type = 'user' THEN 'U_'
                                   ELSE 'A_' 
                               END, 
                               gea.account_id
                           ) as account_id,
                           COALESCE(a.account_id, o.owner_code, u.login_id) as account_name,
                           COALESCE(a.name, o.name, u.name) as name,
                           CASE WHEN gea.owner_type = 'user' THEN u.role WHEN gea.owner_type = 'owner' THEN 'OWNER' ELSE a.role END as role,
                           CASE WHEN gea.owner_type = 'user' THEN gea.account_id ELSE NULL END as user_raw_id,
                           0 as read_only,
                           CASE WHEN gea.owner_type = 'owner' THEN 1 ELSE 0 END as is_external_partner
                    FROM group_earnings_allocation gea
                    LEFT JOIN account a ON gea.account_id = a.id AND gea.owner_type = 'account'
                    LEFT JOIN owner o ON gea.account_id = o.id AND gea.owner_type = 'owner'
                    LEFT JOIN user u ON gea.account_id = u.id AND gea.owner_type = 'user'
                    WHERE gea.group_id = ?
                    ORDER BY gea.percentage DESC
                ");
            } else {
                $gStmt = $pdo->prepare("
                    SELECT gea.id as ownership_id, gea.percentage, 'account' as owner_type,
                           CONCAT('A_', gea.account_id) as account_id,
                           a.account_id as account_name, a.name, a.role,
                           NULL as user_raw_id,
                           0 as read_only,
                           0 as is_external_partner
                    FROM group_earnings_allocation gea
                    JOIN account a ON gea.account_id = a.id
                    WHERE gea.group_id = ?
                    ORDER BY gea.percentage DESC
                ");
            }

            $gStmt->execute([$group_id]);
            $owners = $gStmt->fetchAll(PDO::FETCH_ASSOC);

            $totalPct = 0;
            foreach ($owners as &$owner) {
                $owner['percentage'] = (float)$owner['percentage'];
                $totalPct += $owner['percentage'];
            }
            
            $response['groups'][$group_id]['allocated_percentage'] = $totalPct;
            $response['equities'][$group_id] = $owners;
        }
    }

    echo json_encode([
        'status' => 'success',
        'data' => [
            'groups' => array_values($response['groups']),
            'equities' => $response['equities']
        ]
    ]);
} catch (PDOException $e) {
    if ($e->getCode() == '42S02') { // Table doesn't exist
        echo json_encode(['status' => 'success', 'data' => ['groups' => [], 'equities' => []]]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }
}
?>
