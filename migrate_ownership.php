<?php
require 'session_check.php';
require 'config.php';

// Only allow Admin/Owner to run this (or just check session)
if (!isset($_SESSION['user_id'])) {
    die("Unauthorized");
}

echo "<h1>Database Migration for Polymorphic Ownership</h1>";

try {
    // 1. Check if owner_type column exists
    $stmt = $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'");
    $exists = $stmt->rowCount() > 0;
    
    if (!$exists) {
        echo "Adding `owner_type` column to `company_ownership`...<br>";
        // We set default to 'account' for backward compatibility
        $pdo->exec("ALTER TABLE company_ownership ADD COLUMN owner_type VARCHAR(20) NOT NULL DEFAULT 'account' AFTER account_id");
        echo "<span style='color:green'>Success: Column `owner_type` added.</span><br>";
    } else {
        echo "<span style='color:gray'>Notice: Column `owner_type` already exists.</span><br>";
    }
    
    // 2. Drop the foreign key on account_id if it exists, because account_id can now store user_id as well
    $stmt = $pdo->query("
        SELECT CONSTRAINT_NAME 
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'company_ownership' 
          AND COLUMN_NAME = 'account_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL
    ");
    $fks = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($fks as $fk) {
        $fkName = $fk['CONSTRAINT_NAME'];
        echo "Dropping foreign key constraint `{$fkName}`...<br>";
        $pdo->exec("ALTER TABLE company_ownership DROP FOREIGN KEY `{$fkName}`");
        echo "<span style='color:green'>Success: Foreign key `{$fkName}` dropped.</span><br>";
    }
    
    if (empty($fks)) {
         echo "<span style='color:gray'>Notice: No restrictive foreign keys found. Safe to proceed.</span><br>";
    }

    echo "<h3>Migration Complete. You can close this window now.</h3>";
} catch (PDOException $e) {
    echo "<span style='color:red'>Error executing migration: " . $e->getMessage() . "</span>";
}
?>
