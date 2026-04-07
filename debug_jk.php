<?php
require_once 'config.php';
$stmt = $pdo->query("SELECT id, owner_code FROM owner WHERE owner_code='JK'");
$owner = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$owner) { die("No owner found\n"); }
$ownerId = $owner['id'];

// Mock session
$_SESSION['role'] = 'owner';
$_SESSION['real_owner_id'] = $ownerId;
$_SESSION['user_id'] = $ownerId;

function getCompaniesByOwner(PDO $pdo, int $ownerId): array {
    $stmt = $pdo->prepare("
        SELECT DISTINCT c.id, c.company_id, 
               c.group_id,
               IF(c.owner_id = ?, 0, 1) as is_external
        FROM company c
        LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
        WHERE c.owner_id = ? OR (co.account_id = ? AND co.percentage > 0)
        ORDER BY is_external ASC, c.company_id ASC
    ");
    $stmt->execute([$ownerId, $ownerId, $ownerId, $ownerId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

$companies = getCompaniesByOwner($pdo, $ownerId);
echo json_encode($companies, JSON_PRETTY_PRINT);
?>
