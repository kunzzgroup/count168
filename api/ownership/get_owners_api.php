<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$company_id = $_GET['company_id'] ?? null;

if (!$company_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing company_id']);
    exit();
}

try {
    // Check if table exists
    $tableExists = $pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() > 0;
    
    if (!$tableExists) {
        echo json_encode(['status' => 'success', 'data' => []]);
        exit();
    }



    // Determine if owner_type column exists
    $hasOwnerType = $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'")->rowCount() > 0;

    if ($hasOwnerType) {
        // Polymorphic query
        $stmt = $pdo->prepare("
            SELECT co.id as ownership_id, co.percentage, co.owner_type,
                   CONCAT(
                       CASE 
                           WHEN co.owner_type = 'owner' THEN 'O_'
                           WHEN co.owner_type = 'user' THEN 'U_'
                           ELSE 'A_' 
                       END, 
                       co.account_id
                   ) as account_id,
                   COALESCE(co.partner_group_id, a.account_id, o.owner_code, u.login_id) as account_name,
                   COALESCE(a.name, o.name, u.name) as name,
                   COALESCE(a.role, 'OWNER', u.role) as role,
                   co.partner_group_id
            FROM company_ownership co
            LEFT JOIN account a ON co.account_id = a.id AND co.owner_type = 'account'
            LEFT JOIN owner o ON co.account_id = o.id AND co.owner_type = 'owner'
            LEFT JOIN user u ON co.account_id = u.id AND co.owner_type = 'user'
            WHERE co.company_id = ?
            ORDER BY co.percentage DESC
        ");
    } else {
        // Fallback for before migration
        $stmt = $pdo->prepare("
            SELECT co.id as ownership_id, co.percentage, 'account' as owner_type,
                   CONCAT('A_', co.account_id) as account_id,
                   a.account_id as account_name, a.name, a.role,
                   NULL as partner_group_id
            FROM company_ownership co
            JOIN account a ON co.account_id = a.id
            WHERE co.company_id = ?
            ORDER BY co.percentage DESC, a.account_id ASC
        ");
    }

    $stmt->execute([$company_id]);
    $owners = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Convert percentage to float for JSON safety
    foreach ($owners as &$owner) {
        $owner['percentage'] = (float)$owner['percentage'];
    }

    echo json_encode([
        'status' => 'success',
        'data' => $owners
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
