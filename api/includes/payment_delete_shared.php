<?php
declare(strict_types=1);

/**
 * Shared payment/transaction delete helpers (Payment Maintenance + Auto Renew undo).
 */

require_once __DIR__ . '/../deleted_log/deleted_log.php';
require_once __DIR__ . '/../bankprocess_maintenance/maintenance_accounting_resend_lib.php';

function payment_delete_ensure_transactions_deleted_table(PDO $pdo): void
{
    $sql = "
        CREATE TABLE IF NOT EXISTS transactions_deleted (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_id INT NOT NULL,
            company_id INT NOT NULL,
            transaction_type ENUM('WIN', 'LOSE', 'PAYMENT', 'RECEIVE', 'CONTRA', 'RATE', 'CLAIM', 'CLEAR', 'ADJUSTMENT') NOT NULL,
            account_id INT NOT NULL,
            from_account_id INT NULL,
            amount DECIMAL(25, 8) NOT NULL,
            currency_id INT NULL,
            transaction_date DATE NOT NULL,
            description VARCHAR(500) NULL,
            sms VARCHAR(500) NULL,
            created_by INT NULL,
            created_by_owner INT NULL,
            created_at TIMESTAMP NULL,
            deleted_by_user_id INT NULL,
            deleted_by_owner_id INT NULL,
            deleted_at TIMESTAMP NULL,
            INDEX idx_company_date (company_id, transaction_date),
            INDEX idx_transaction_id (transaction_id),
            INDEX idx_deleted_at (deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";
    $pdo->exec($sql);

    try {
        $amountCol = $pdo->query("SHOW COLUMNS FROM transactions_deleted LIKE 'amount'")->fetch(PDO::FETCH_ASSOC);
        if ($amountCol && stripos((string) ($amountCol['Type'] ?? ''), 'decimal(25,8)') === false) {
            $pdo->exec('ALTER TABLE transactions_deleted MODIFY COLUMN amount DECIMAL(25,8) NOT NULL');
        }
    } catch (PDOException $e) {
    }

    try {
        $colStmt = $pdo->query("SHOW COLUMNS FROM transactions_deleted LIKE 'currency_id'");
        if ($colStmt && $colStmt->rowCount() === 0) {
            $pdo->exec('ALTER TABLE transactions_deleted ADD COLUMN currency_id INT NULL AFTER amount');
        }
    } catch (PDOException $e) {
    }
}

function payment_delete_backup_to_deleted(PDO $pdo, array $ids, int $companyId, ?int $deletedByUserId, ?int $deletedByOwnerId): void
{
    if (empty($ids)) {
        return;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = "
        INSERT INTO transactions_deleted (
            transaction_id, company_id, transaction_type, account_id, from_account_id,
            amount, currency_id, transaction_date, description, sms, created_by, created_by_owner, created_at,
            deleted_by_user_id, deleted_by_owner_id, deleted_at
        )
        SELECT
            t.id AS transaction_id, ? AS company_id, t.transaction_type, t.account_id, t.from_account_id,
            t.amount, t.currency_id, t.transaction_date, t.description, t.sms, t.created_by, t.created_by_owner, t.created_at,
            ?, ?, NOW()
        FROM transactions t
        INNER JOIN account a ON t.account_id = a.id
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE t.id IN ($placeholders) AND ac.company_id = ?
    ";
    $params = array_merge([$companyId, $deletedByUserId, $deletedByOwnerId], $ids, [$companyId]);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
}

function payment_delete_transaction_entries(PDO $pdo, array $ids): void
{
    if (empty($ids)) {
        return;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = "DELETE FROM transaction_entry WHERE header_id IN ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($ids);
}

function payment_delete_transactions(PDO $pdo, array $ids, int $companyId): int
{
    if (empty($ids)) {
        return 0;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = "DELETE t
            FROM transactions t
            INNER JOIN account a ON t.account_id = a.id
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE t.id IN ($placeholders) AND ac.company_id = ?";
    $params = array_merge($ids, [$companyId]);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (int) $stmt->rowCount();
}

function payment_delete_expand_ids_by_rate_group(PDO $pdo, array $ids, int $companyId): array
{
    if (empty($ids)) {
        return $ids;
    }

    try {
        $check = $pdo->query("SHOW TABLES LIKE 'transactions_rate_details'");
        if (!$check || $check->rowCount() === 0) {
            return $ids;
        }
    } catch (PDOException $e) {
        return $ids;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sqlGroups = "
        SELECT DISTINCT rate_group_id
        FROM transactions_rate_details
        WHERE transaction_id IN ($placeholders)
          AND company_id = ?
    ";
    $stmtGroups = $pdo->prepare($sqlGroups);
    $stmtGroups->execute(array_merge($ids, [$companyId]));
    $groupIds = $stmtGroups->fetchAll(PDO::FETCH_COLUMN);
    if (empty($groupIds)) {
        return $ids;
    }

    $groupPlaceholders = implode(',', array_fill(0, count($groupIds), '?'));
    $sqlTx = "
        SELECT DISTINCT transaction_id
        FROM transactions_rate_details
        WHERE rate_group_id IN ($groupPlaceholders)
          AND company_id = ?
    ";
    $stmtTx = $pdo->prepare($sqlTx);
    $stmtTx->execute(array_merge($groupIds, [$companyId]));
    $extraIds = $stmtTx->fetchAll(PDO::FETCH_COLUMN);

    $allIds = array_map('intval', array_merge($ids, $extraIds ?: []));
    return array_values(array_unique(array_filter($allIds, static fn ($id) => $id > 0)));
}

function payment_delete_clear_transaction_search_cache(): void
{
    $cacheDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'count168_tx_search';
    if (!is_dir($cacheDir)) {
        return;
    }
    foreach (scandir($cacheDir) as $file) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        $fullPath = $cacheDir . DIRECTORY_SEPARATOR . $file;
        if (is_file($fullPath)) {
            @unlink($fullPath);
        }
    }
}

/**
 * Delete transactions with backup to transactions_deleted (same path as Payment Maintenance).
 *
 * @return int number of deleted rows
 */
function payment_delete_transactions_by_ids(
    PDO $pdo,
    array $ids,
    int $companyId,
    array $session,
    ?string $deletedLogPageTag = null,
    bool $manageTransaction = true
): int {
    $ids = array_values(array_filter(array_map('intval', $ids), static fn ($id) => $id > 0));
    if (empty($ids) || $companyId <= 0) {
        return 0;
    }

    $ids = payment_delete_expand_ids_by_rate_group($pdo, $ids, $companyId);

    $userRole = strtolower(trim((string) ($session['role'] ?? '')));
    $userId = isset($session['user_id']) ? (int) $session['user_id'] : 0;
    $ownerId = isset($session['owner_id']) ? (int) $session['owner_id'] : null;
    $deletedByUserId = null;
    $deletedByOwnerId = null;
    if ($userRole === 'owner') {
        $deletedByOwnerId = $ownerId ?: $userId;
    } else {
        $deletedByUserId = $userId > 0 ? $userId : null;
    }

    $pageTag = $deletedLogPageTag ?: '/api/payment_maintenance/delete_api.php';
    $userTag = (string) ($session['login_id'] ?? $session['name'] ?? '');

    payment_delete_ensure_transactions_deleted_table($pdo);
    bmp_ensureMaintenanceResendPendingTable($pdo);

    $startedHere = false;
    if ($manageTransaction && !$pdo->inTransaction()) {
        $pdo->beginTransaction();
        $startedHere = true;
    }

    try {
        foreach ($ids as $tid) {
            $entryListStmt = $pdo->prepare('SELECT id FROM transaction_entry WHERE header_id = ?');
            $entryListStmt->execute([(int) $tid]);
            while ($eid = $entryListStmt->fetchColumn()) {
                deletedLog($pdo, $userTag, $pageTag, 'transaction_entry', (string) $eid);
            }
            deletedLog($pdo, $userTag, $pageTag, 'transactions', (string) $tid);
        }

        bmp_recordResendPendingForTransactionIds($pdo, $companyId, $ids);
        payment_delete_backup_to_deleted($pdo, $ids, $companyId, $deletedByUserId, $deletedByOwnerId);
        payment_delete_transaction_entries($pdo, $ids);
        $deleted = payment_delete_transactions($pdo, $ids, $companyId);

        if ($startedHere) {
            $pdo->commit();
        }

        payment_delete_clear_transaction_search_cache();

        return $deleted;
    } catch (Throwable $e) {
        if ($startedHere && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}
