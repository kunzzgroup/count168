<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$company_id = $_GET['company_id'] ?? null;

try {
    if ($company_id) {
        // Fetch accounts linked to the company
        $stmtAcc = $pdo->prepare("
            SELECT CONCAT('A_', a.id) as id, a.account_id as account_name, a.name, a.role
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE ac.company_id = ? 
              AND a.status = 'active'
              AND LOWER(a.role) IN ('company', 'partner', 'agent')
        ");
        $stmtAcc->execute([$company_id]);
        $accounts = $stmtAcc->fetchAll(PDO::FETCH_ASSOC);

        // Fetch native owner and any linked external partners
        $stmtOwner = $pdo->prepare("
            SELECT DISTINCT CONCAT('O_', o.id) as id, 
                   COALESCE(co.partner_group_id, o.owner_code) as account_name, 
                   o.name, 'OWNER' as role, 'owner' as type
            FROM owner o
            LEFT JOIN company c ON o.id = c.owner_id AND c.id = :comp_id1
            LEFT JOIN company_ownership co ON o.id = co.account_id AND co.owner_type = 'owner' AND co.company_id = :comp_id2
            WHERE (c.id IS NOT NULL OR co.company_id IS NOT NULL)
              AND LOWER(o.status) = 'active'
        ");
        $stmtOwner->execute(['comp_id1' => $company_id, 'comp_id2' => $company_id]);
        $users = $stmtOwner->fetchAll(PDO::FETCH_ASSOC);

        // Combine
        $combined = array_merge($accounts, $users);
        
        // Sort alphabetically by account_name
        usort($combined, function($a, $b) {
            return strcmp($a['account_name'], $b['account_name']);
        });

        echo json_encode([
            'status' => 'success',
            'data' => $combined
        ]);

    } else {
        // Fallback or global mode, return generally available
        $stmtAcc = $pdo->prepare("
            SELECT CONCAT('A_', id) as id, account_id as account_name, name, role
            FROM account
            WHERE status = 'active'
              AND LOWER(role) IN ('company', 'partner', 'agent')
        ");
        $stmtAcc->execute();
        $accounts = $stmtAcc->fetchAll(PDO::FETCH_ASSOC);

        $stmtOwner = $pdo->prepare("
            SELECT CONCAT('O_', id) as id, owner_code as account_name, name, 'OWNER' as role, 'owner' as type
            FROM owner
            WHERE LOWER(status) = 'active'
              AND id = ?
        ");
        $stmtOwner->execute([$_SESSION['user_id']]);
        $users = $stmtOwner->fetchAll(PDO::FETCH_ASSOC);

        $combined = array_merge($accounts, $users);
        usort($combined, function($a, $b) {
            return strcmp($a['account_name'], $b['account_name']);
        });

        echo json_encode([
            'status' => 'success',
            'data' => $combined
        ]);
    }

} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
