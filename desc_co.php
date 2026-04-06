<?php
require_once 'config.php';
try {
    $stmt = $pdo->query('SHOW COLUMNS FROM company_ownership');
    print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Exception $e) {}
