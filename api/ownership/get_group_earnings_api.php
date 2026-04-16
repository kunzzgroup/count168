<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$group_id = $_GET['group_id'] ?? null;

if (!$group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
    exit();
}

try {
    // Auto-create tables if they don't exist
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

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_earnings_config (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(100) NOT NULL COMMENT 'Group ID (matches company.group_id)',
            company_id INT NOT NULL COMMENT 'FK to company.id',
            account_name VARCHAR(255) NOT NULL COMMENT 'Account display name',
            account_percentage DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT 'Account share %',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_group_company (group_id, company_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // 1. Get Group equity percentage
    $stmtEquity = $pdo->prepare("SELECT equity_percentage FROM group_equity WHERE group_id = ?");
    $stmtEquity->execute([$group_id]);
    $equityRow = $stmtEquity->fetch(PDO::FETCH_ASSOC);
    $equity_percentage = $equityRow ? (float)$equityRow['equity_percentage'] : 0;

    // 2. Get all companies in this group
    $stmtCompanies = $pdo->prepare("
        SELECT id, company_id as name, group_id
        FROM company
        WHERE group_id = ?
        ORDER BY company_id ASC
    ");
    $stmtCompanies->execute([$group_id]);
    $companies = $stmtCompanies->fetchAll(PDO::FETCH_ASSOC);

    // 3. Get account configs for each company in this group
    $stmtAccounts = $pdo->prepare("
        SELECT id, company_id, account_name, account_percentage
        FROM group_earnings_config
        WHERE group_id = ? AND company_id = ?
        ORDER BY id ASC
    ");

    $companyData = [];
    foreach ($companies as $company) {
        $stmtAccounts->execute([$group_id, $company['id']]);
        $accounts = $stmtAccounts->fetchAll(PDO::FETCH_ASSOC);
        
        // Convert percentages to float
        foreach ($accounts as &$acc) {
            $acc['account_percentage'] = (float)$acc['account_percentage'];
        }

        $companyData[] = [
            'id' => (int)$company['id'],
            'name' => $company['name'],
            'accounts' => $accounts
        ];
    }

    echo json_encode([
        'status' => 'success',
        'data' => [
            'group_id' => $group_id,
            'equity_percentage' => $equity_percentage,
            'companies' => $companyData
        ]
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
