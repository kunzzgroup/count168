<?php
$host = '127.0.0.1';
$dbname = 'u857194726_count168';
$dbuser = 'u857194726_count168';
$dbpass = 'Kholdings1688@';
try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $dbuser, $dbpass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("ALTER TABLE company_ownership ADD COLUMN include_group TINYINT(1) DEFAULT 1");
    echo "Success";
} catch (Exception $e) {
    echo $e->getMessage();
}
