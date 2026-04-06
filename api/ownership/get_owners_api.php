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
    
    // Get owners
    $stmt = $pdo->prepare("
        SELECT co.id as ownership_id, co.percentage, a.id as account_id, a.account_id as account_name, a.name, a.role
        FROM company_ownership co
        JOIN account a ON co.account_id = a.id
        WHERE co.company_id = ?
        ORDER BY co.percentage DESC, a.account_id ASC
    ");
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
