<?php
require '../../config.php';
$stmt = $pdo->query('SELECT * FROM group_earnings_config');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
