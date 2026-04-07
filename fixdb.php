<?php
require_once "config.php";
try {
    $pdo->exec("ALTER TABLE company_ownership ADD COLUMN partner_group_id VARCHAR(50) DEFAULT NULL");
    echo "Added partner_group_id\n";
} catch (Exception $e) {
    if (strpos($e->getMessage(), 'Duplicate column') !== false) {
        echo "Column already exists\n";
    } else {
        echo "Error: " . $e->getMessage() . "\n";
    }
}
try {
    // Revert TT back to AA just to fix the user's corrupted state during testing
    $pdo->exec("UPDATE company SET group_id = 'AA' WHERE company_id = 'TT'");
    echo "Restored TT to AA\n";
} catch (Exception $e) {
    echo "Error restoring TT\n";
}
?>
