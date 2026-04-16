<?php
require 'config.php';
$stmt = $pdo->query('SELECT id, name, group_id FROM company LIMIT 10');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
