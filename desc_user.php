<?php
require 'config.php';
$stmt = $pdo->query("DESCRIBE user");
$res = $stmt->fetchAll(PDO::FETCH_ASSOC);
file_put_contents('user_schema.txt', print_r($res, true));
?>
