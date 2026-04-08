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

        // Fetch user partners mapped to this company
        $stmtPartner = $pdo->prepare("
            SELECT DISTINCT CONCAT('U_', u.id) as id, 
                   u.login_id as account_name, 
                   u.name, 'PARTNER' as role, 'user' as type
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE ucm.company_id = ? AND LOWER(u.role) = 'partner' AND LOWER(u.status) = 'active'
        ");
        $stmtPartner->execute([$company_id]);
        $partners = $stmtPartner->fetchAll(PDO::FETCH_ASSOC);

        // Sort by account_name
        $combined = array_merge($users, $partners);
        
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
        $stmtOwner = $pdo->prepare("
            SELECT CONCAT('O_', id) as id, owner_code as account_name, name, 'OWNER' as role, 'owner' as type
            FROM owner
            WHERE LOWER(status) = 'active'
              AND id = ?
        ");
        $stmtOwner->execute([$_SESSION['user_id']]);
        $users = $stmtOwner->fetchAll(PDO::FETCH_ASSOC);

        // For fallback, fetch all active partners in the system (or mapped to something? If global, just all partners)
        $stmtPartner = $pdo->prepare("
            SELECT DISTINCT CONCAT('U_', id) as id, 
                   login_id as account_name, 
                   name, 'PARTNER' as role, 'user' as type
            FROM user
            WHERE LOWER(role) = 'partner' AND LOWER(status) = 'active'
        ");
        $stmtPartner->execute();
        $partners = $stmtPartner->fetchAll(PDO::FETCH_ASSOC);

        $combined = array_merge($users, $partners);
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
