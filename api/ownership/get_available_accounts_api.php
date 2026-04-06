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
    // Only fetch accounts linked to this company
    $stmt = $pdo->prepare("
        SELECT a.id, a.account_id as account_name, a.name, a.role
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE ac.company_id = ? AND a.status = 'active'
        ORDER BY a.account_id ASC
    ");
    
    // If account_company doesn't exist, this will throw an exception,
    // so let's check if the table exists first. If it doesn't, we just 
    // fetch all active accounts.
    $acTableExists = false;
    try {
        $checkStmt = $pdo->query("SHOW TABLES LIKE 'account_company'");
        $acTableExists = $checkStmt->rowCount() > 0;
    } catch (PDOException $e) {}

    if ($acTableExists) {
        $stmt->execute([$company_id]);
    } else {
        $stmt = $pdo->prepare("
            SELECT id, account_id as account_name, name, role
            FROM account
            WHERE status = 'active'
            ORDER BY account_id ASC
        ");
        $stmt->execute();
    }
    
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'data' => $accounts
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
