<?php
require_once 'config.php';
$ownerId = 4; // assuming TEST is id 4 based on screenshot "4 TEST" 
$stmt = $pdo->prepare("
    SELECT DISTINCT c.id, c.company_id, 
           COALESCE(co.partner_group_id, c.group_id) as group_id,
           IF(c.owner_id = ?, 0, 1) as is_external
    FROM company c
    LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
    WHERE c.owner_id = ? OR (co.account_id = ? AND co.percentage > 0)
    ORDER BY is_external ASC, c.company_id ASC
");
$stmt->execute([$ownerId, $ownerId, $ownerId, $ownerId]);
var_dump($stmt->fetchAll(PDO::FETCH_ASSOC));
?>
