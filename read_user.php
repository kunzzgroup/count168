<?php
require 'config.php';
$stmt = $pdo->query("SELECT * FROM user LIMIT 5");
$res = $stmt->fetchAll(PDO::FETCH_ASSOC);
file_put_contents('user_data_debug.txt', print_r($res, true));
?>
