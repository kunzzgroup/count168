<?php
require 'config.php';
$stmtUser = $pdo->prepare("SELECT CONCAT('U_', id) as id, login_id as account_name, name, role FROM user WHERE status = 'active' AND LOWER(role) = 'owner'");
$stmtUser->execute();
print_r($stmtUser->fetchAll(PDO::FETCH_ASSOC));
?>
