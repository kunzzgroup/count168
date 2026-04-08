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
    // Check if the table exists first (to prevent fatals if SQL wasn't run)
    $tableExists = $pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() > 0;
    
    // Get companies available to this user
    $companies = [];
    if ($current_user_role === 'owner') {
        $owner_id = $_SESSION['owner_id'] ?? $current_user_id;
        $session_company_id = $_SESSION['company_id'] ?? null;

        // Get both the NATIVE group_id (c.group_id) and the PARTNER group_id (co.partner_group_id)
        // for the current session company. These are kept separate to correctly scope ownership.
        $partner_group = null;  // Explicit link group (e.g. LOL externally linked TT)
        $native_group  = null;  // TT's own company.group_id in the DB
        if ($session_company_id) {
            $stmtGrp = $pdo->prepare("
                SELECT co.partner_group_id, c.group_id
                FROM company c
                LEFT JOIN company_ownership co
                    ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                WHERE c.id = ?
                LIMIT 1
            ");
            $stmtGrp->execute([$owner_id, $session_company_id]);
            $grpRow = $stmtGrp->fetch(PDO::FETCH_ASSOC);
            if ($grpRow) {
                $partner_group = $grpRow['partner_group_id'] ?: null;
                $native_group  = $grpRow['group_id']         ?: null;
            }
        }

        // Build a targeted query:
        //   - EXTERNAL companies (c.owner_id != this owner) only show if they were explicitly
        //     linked to us via the same partner_group_id (e.g. JK linked TT to LOL group).
        //   - NATIVE companies (c.owner_id == this owner) show if they share the session
        //     company's own native group_id (e.g. JK's own companies under JK's group).
        $params = [];
        $whereParts = [];

        if ($partner_group !== null) {
            // External companies explicitly linked to us with this partner_group
            $whereParts[] = "(c.owner_id != ? AND co.account_id = ? AND LOWER(co.partner_group_id) = LOWER(?))";
            $params = array_merge($params, [$owner_id, $owner_id, $partner_group]);
        }

        if ($native_group !== null) {
            // Native companies in the same group as the session company
            $whereParts[] = "(c.owner_id = ? AND LOWER(c.group_id) = LOWER(?))";
            $params = array_merge($params, [$owner_id, $native_group]);
        }

        if (empty($whereParts) && $session_company_id) {
            // Fallback: just show the current session company
            $whereParts[] = "c.id = ?";
            $params[] = $session_company_id;
        } elseif (empty($whereParts)) {
            // No context at all: show all owner's companies
            $whereParts[] = "c.owner_id = ?";
            $params[] = $owner_id;
        }

        $whereSQL = implode(" OR ", $whereParts);
        $stmt = $pdo->prepare("
            SELECT DISTINCT c.id, c.company_id as name
            FROM company c
            LEFT JOIN company_ownership co
                ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
            WHERE ($whereSQL)
            ORDER BY c.company_id ASC
        ");
        array_unshift($params, $owner_id);  // prepend for LEFT JOIN condition
        $stmt->execute($params);
        $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $stmt = $pdo->prepare("
            SELECT DISTINCT c.id, c.company_id as name
            FROM company c
            INNER JOIN user_company_map ucm ON c.id = ucm.company_id
            WHERE ucm.user_id = ?
            ORDER BY c.company_id ASC
        ");
        $stmt->execute([$current_user_id]);
        $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    // Get total ownership assigned for each company
    if ($tableExists && count($companies) > 0) {
        $hasOwnerType = $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'")->rowCount() > 0;
        
        $company_ids = array_column($companies, 'id');
        $in = str_repeat('?,', count($company_ids) - 1) . '?';
        
        if ($hasOwnerType) {
            $stmt = $pdo->prepare("
                SELECT company_id, SUM(percentage) as total_percent
                FROM company_ownership
                WHERE company_id IN ($in) AND owner_type != 'account'
                GROUP BY company_id
            ");
        } else {
            // If before migration, return 0 for safe fallback rather than accounts we want ignored
            $stmt = $pdo->prepare("
                SELECT company_id, SUM(percentage) as total_percent
                FROM company_ownership
                WHERE company_id IN ($in) AND 1=0
                GROUP BY company_id
            ");
        }
        $stmt->execute($company_ids);
        $totals = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        // Map totals to companies
        foreach ($companies as &$company) {
            $company['allocated_percentage'] = isset($totals[$company['id']]) ? (float)$totals[$company['id']] : 0.00;
        }
    } else {
        foreach ($companies as &$company) {
            $company['allocated_percentage'] = 0.00;
        }
    }

    echo json_encode([
        'status' => 'success',
        'data' => $companies
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
