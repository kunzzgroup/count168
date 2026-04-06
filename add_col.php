<?php
require 'config.php';
try {
    $pdo->exec("ALTER TABLE company_ownership ADD COLUMN include_group TINYINT(1) DEFAULT 0");
    echo "Success!";
} catch (Exception $e) {
    if (strpos($e->getMessage(), 'Duplicate column name') !== false) {
        echo "Column already exists";
    } else {
        echo "Error: " . $e->getMessage();
    }
}
