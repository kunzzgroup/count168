<?php
require_once 'config.php';

try {
    $stmt = $pdo->query("SELECT company_id, name, group_id FROM company WHERE name = 'TT' OR company_id = 'TT'");
    $res = $stmt->fetchAll(PDO::FETCH_ASSOC);
    print_r($res);
    
    // Also get all groups
    $stmt2 = $pdo->query("SELECT DISTINCT group_id FROM company");
    $groups = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    echo "All groups:\n";
    print_r($groups);
    
    // User MS companies
    $stmt3 = $pdo->query("SELECT c.company_id, c.name, c.group_id FROM user u JOIN user_company_map m ON u.id = m.user_id JOIN company c ON m.company_id = c.id WHERE u.login_id = 'MS'");
    $user_companies = $stmt3->fetchAll(PDO::FETCH_ASSOC);
    echo "User MS companies:\n";
    print_r($user_companies);
} catch (Exception $e) {
    echo $e->getMessage();
}
?>
