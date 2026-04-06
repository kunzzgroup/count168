<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once 'config.php';

echo "<h2>Database Patch for Partnership Role</h2>";

try {
    // 1. Get the current column type for 'role'
    $stmt = $pdo->query("SHOW COLUMNS FROM user LIKE 'role'");
    $col = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo "<b>Current Column Type:</b> " . htmlspecialchars($col['Type']) . "<br><br>";
    
    // If it's an ENUM
    if (strpos($col['Type'], 'enum') === 0) {
        $type = $col['Type'];
        // Check if partnership is already there
        if (strpos($type, "'partnership'") === false) {
            // It's missing, let's alter it
            $newType = str_replace(")", ",'partnership')", $type);
            $alterStmt = $pdo->query("ALTER TABLE user MODIFY COLUMN role $newType NOT NULL");
            
            // Double check
            $stmtCheck = $pdo->query("SHOW COLUMNS FROM user LIKE 'role'");
            $colCheck = $stmtCheck->fetch(PDO::FETCH_ASSOC);
            echo "<b style='color:green'>Successfully updated!</b><br>";
            echo "<b>New Column Type:</b> " . htmlspecialchars($colCheck['Type']) . "<br>";
        } else {
            echo "<b style='color:blue'>'partnership' already exists in the ENUM. No changes needed.</b><br>";
        }
    } else {
        echo "<b style='color:red'>Role column is not an ENUM, it is " . htmlspecialchars($col['Type']) . ". No automated changes made.</b><br>";
    }
} catch (Exception $e) {
    echo "<b style='color:red'>Error: " . htmlspecialchars($e->getMessage()) . "</b><br>";
}
?>
<br>
<a href="userlist.php">Return to User List</a>
