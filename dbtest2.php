<?php
require_once "config.php";
$stmt = $pdo->query("SELECT * FROM company_ownership WHERE company_id IN (SELECT id FROM company WHERE company_id = 'TT')");
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_PRETTY_PRINT);
?>
