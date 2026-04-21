<?php
require_once __DIR__ . '/../config.php';

$fullMenuPermissions = json_encode([
    'home',
    'admin',
    'account',
    'ownership',
    'process',
    'datacapture',
    'payment',
    'report',
    'maintenance'
], JSON_UNESCAPED_UNICODE);

$pdo->beginTransaction();

try {
    $userStmt = $pdo->prepare("
        SELECT id, login_id, company_id
        FROM user
        WHERE LOWER(role) = 'partnership'
    ");
    $userStmt->execute();
    $users = $userStmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($users)) {
        $pdo->rollBack();
        echo "No partnership accounts found." . PHP_EOL;
        exit(0);
    }

    $updateUserStmt = $pdo->prepare("
        UPDATE user
        SET permissions = ?, account_permissions = NULL, process_permissions = NULL
        WHERE id = ?
    ");

    $upsertCompanyPermStmt = $pdo->prepare("
        INSERT INTO user_company_permissions (user_id, company_id, account_permissions, process_permissions)
        VALUES (?, ?, NULL, NULL)
        ON DUPLICATE KEY UPDATE
            account_permissions = VALUES(account_permissions),
            process_permissions = VALUES(process_permissions)
    ");

    $updatedCount = 0;
    foreach ($users as $u) {
        $updateUserStmt->execute([$fullMenuPermissions, (int) $u['id']]);
        $upsertCompanyPermStmt->execute([(int) $u['id'], (int) $u['company_id']]);
        $updatedCount++;
    }

    $pdo->commit();

    echo "Updated partnership accounts: {$updatedCount}" . PHP_EOL;
    foreach ($users as $u) {
        echo "- id={$u['id']}, login_id={$u['login_id']}, company_id={$u['company_id']}" . PHP_EOL;
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Failed: " . $e->getMessage() . PHP_EOL);
    exit(1);
}
