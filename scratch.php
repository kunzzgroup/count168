<?php
require 'config.php';
$stmt = $pdo->query('DESCRIBE group_equity');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
$stmt2 = $pdo->query('DESCRIBE group_earnings_config');
print_r($stmt2->fetchAll(PDO::FETCH_ASSOC));
