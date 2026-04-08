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

        // Get the effective group_id of the current session company in PHP
        // (avoids SQL collation mismatch by fetching columns separately)
        $effective_group = null;
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
                $effective_group = $grpRow['partner_group_id'] ?: ($grpRow['group_id'] ?: null);
            }
        }

        if ($effective_group) {
            // Fetch all companies for this owner (with partner info), filter by group in PHP
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id as name,
                       co.partner_group_id, c.group_id
                FROM company c
                LEFT JOIN company_ownership co
                    ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                WHERE c.owner_id = ? OR (co.account_id = ? AND co.percentage > 0)
                ORDER BY c.company_id ASC
            ");
            $stmt->execute([$owner_id, $owner_id, $owner_id]);
            $all = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $egLower = strtolower($effective_group);
            $companies = array_values(array_filter($all, function($c) use ($egLower) {
                $effGroup = $c['partner_group_id'] ?: ($c['group_id'] ?: '');
                return strtolower($effGroup) === $egLower;
            }));
            // Strip helper columns
            $companies = array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name']], $companies);
        } elseif ($session_company_id) {
            // No group — scope to just the current company
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id as name
                FROM company c
                LEFT JOIN company_ownership co
                    ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                WHERE c.id = ? AND (c.owner_id = ? OR co.account_id = ?)
                ORDER BY c.company_id ASC
            ");
            $stmt->execute([$owner_id, $session_company_id, $owner_id, $owner_id]);
            $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            // Fallback: show all companies for this owner
            $stmt = $pdo->prepare("SELECT id, company_id as name FROM company WHERE owner_id = ? ORDER BY company_id ASC");
            $stmt->execute([$owner_id]);
            $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
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
