<?php
require 'config.php';
$stmt = $pdo->query('DESCRIBE company_ownership');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
?>
