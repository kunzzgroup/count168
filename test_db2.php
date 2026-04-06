<?php
require 'config.php';
try {
    $stmt = $pdo->query("SHOW CREATE TABLE company_ownership");
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "<pre>" . print_r($res, true) . "</pre>";
} catch (Exception $e) {
    echo $e->getMessage();
}
?>
