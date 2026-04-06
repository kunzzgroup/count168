<?php
require 'config.php';
$stmt = $pdo->query("SHOW COLUMNS FROM company_ownership");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
