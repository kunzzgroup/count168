<?php
/**
 * Snapshot company data before Domain deletion; restore from company_deletion_archive.
 */

function company_deletion_archive_ensure_table(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS `company_deletion_archive` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_db_id` int(10) UNSIGNED NOT NULL,
  `company_code` varchar(50) NOT NULL DEFAULT '',
  `owner_id` int(10) UNSIGNED DEFAULT NULL,
  `owner_code` varchar(50) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `group_id` varchar(50) DEFAULT NULL,
  `deleted_by_user_id` int(11) DEFAULT NULL,
  `deleted_by_owner_id` int(10) UNSIGNED DEFAULT NULL,
  `deleted_by_login` varchar(100) DEFAULT NULL,
  `deleted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `restored_at` timestamp NULL DEFAULT NULL,
  `restored_by_login` varchar(100) DEFAULT NULL,
  `status` enum('deleted','restored') NOT NULL DEFAULT 'deleted',
  `row_counts` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `payload` longtext NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cda_company_db_id` (`company_db_id`),
  KEY `idx_cda_company_code` (`company_code`),
  KEY `idx_cda_status_deleted_at` (`status`,`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
    $pdo->exec($sql);
    $done = true;
}

function cda_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (isset($cache[$table])) {
        return $cache[$table];
    }
    try {
        $stmt = $pdo->prepare('SHOW TABLES LIKE ?');
        $stmt->execute([$table]);
        $cache[$table] = $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        $cache[$table] = false;
    }
    return $cache[$table];
}

function cda_has_column(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (isset($cache[$key])) {
        return $cache[$key];
    }
    if (!cda_table_exists($pdo, $table)) {
        return $cache[$key] = false;
    }
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        $cache[$key] = $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        $cache[$key] = false;
    }
    return $cache[$key];
}

function cda_build_in_placeholders(int $count): string
{
    return implode(',', array_fill(0, max(0, $count), '?'));
}

function cda_normalize_ids(array $ids): array
{
    $out = [];
    foreach ($ids as $id) {
        if ($id === null || $id === '') {
            continue;
        }
        $out[] = (int) $id;
    }
    return array_values(array_unique($out));
}

/** @return list<array<string,mixed>> */
function cda_fetch_by_column(PDO $pdo, string $table, string $column, array $ids): array
{
    $ids = cda_normalize_ids($ids);
    if ($ids === [] || !cda_table_exists($pdo, $table) || !cda_has_column($pdo, $table, $column)) {
        return [];
    }
    $ph = cda_build_in_placeholders(count($ids));
    $stmt = $pdo->prepare("SELECT * FROM `$table` WHERE `$column` IN ($ph)");
    $stmt->execute($ids);
    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function cda_add_rows(array &$payload, string $table, array $rows): void
{
    if ($rows === []) {
        return;
    }
    if (!isset($payload[$table])) {
        $payload[$table] = [];
    }
    $seen = [];
    foreach ($payload[$table] as $row) {
        if (isset($row['id'])) {
            $seen[(string) $table . ':' . $row['id']] = true;
        }
    }
    foreach ($rows as $row) {
        if (isset($row['id'])) {
            $key = (string) $table . ':' . $row['id'];
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
        }
        $payload[$table][] = $row;
    }
}

function cda_add_by_company_id(PDO $pdo, array &$payload, string $table, int $companyId): void
{
    if (!cda_has_column($pdo, $table, 'company_id')) {
        return;
    }
    cda_add_rows($payload, $table, cda_fetch_by_column($pdo, $table, 'company_id', [$companyId]));
}

/** @return list<int> */
function cda_orphan_account_ids(PDO $pdo, array $accountIds, int $companyId): array
{
    $accountIds = cda_normalize_ids($accountIds);
    if ($accountIds === []) {
        return [];
    }
    $ph = cda_build_in_placeholders(count($accountIds));
    $sql = "
        SELECT a.id
        FROM account a
        WHERE a.id IN ($ph)
          AND NOT EXISTS (
              SELECT 1 FROM account_company ac
              WHERE ac.account_id = a.id AND ac.company_id != ?
          )
    ";
    $params = array_merge($accountIds, [$companyId]);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return cda_normalize_ids($stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** @return list<int> */
function cda_collect_transaction_ids(PDO $pdo, int $companyId, array $accountIds): array
{
    if (!cda_table_exists($pdo, 'transactions')) {
        return [];
    }
    $clauses = [];
    $params = [];
    if (cda_has_column($pdo, 'transactions', 'company_id')) {
        $clauses[] = 'company_id = ?';
        $params[] = $companyId;
    }
    $accountIds = cda_normalize_ids($accountIds);
    if ($accountIds !== []) {
        $ph = cda_build_in_placeholders(count($accountIds));
        if (cda_has_column($pdo, 'transactions', 'account_id')) {
            $clauses[] = "account_id IN ($ph)";
            $params = array_merge($params, $accountIds);
        }
        if (cda_has_column($pdo, 'transactions', 'from_account_id')) {
            $clauses[] = "from_account_id IN ($ph)";
            $params = array_merge($params, $accountIds);
        }
    }
    if ($clauses === []) {
        return [];
    }
    $sql = 'SELECT id FROM transactions WHERE ' . implode(' OR ', $clauses);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return cda_normalize_ids($stmt->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Build full payload for one company (all related rows still in DB).
 *
 * @return array<string, list<array<string,mixed>>>
 */
function company_deletion_archive_collect_payload(PDO $pdo, int $companyId): array
{
    $payload = [];

    cda_add_rows($payload, 'company', cda_fetch_by_column($pdo, 'company', 'id', [$companyId]));
    if (empty($payload['company'])) {
        return [];
    }

    $companyIdTables = [
        'company_ownership',
        'company_auto_renew_request',
        'company_countries',
        'company_selected_banks',
        'company_selected_countries',
        'country_bank',
        'currency',
        'description',
        'process',
        'submitted_processes',
        'data_captures',
        'data_capture_details',
        'data_capture_templates',
        'data_capture_summary_state',
        'data_capture_submit_queue',
        'bank_process',
        'user_company_map',
        'user_company_permissions',
        'account_company',
        'account_link',
        'process_accounting_posted',
        'process_accounting_due_dismissed',
        'bank_process_accounting_resend_daily_guard',
        'bank_process_maintenance_resend_pending',
    ];
    foreach ($companyIdTables as $table) {
        cda_add_by_company_id($pdo, $payload, $table, $companyId);
    }

    $accountIds = [];
    foreach ($payload['account_company'] ?? [] as $row) {
        if (isset($row['account_id'])) {
            $accountIds[] = (int) $row['account_id'];
        }
    }
    $accountIds = cda_normalize_ids($accountIds);
    $orphanAccountIds = cda_orphan_account_ids($pdo, $accountIds, $companyId);

    $processIds = [];
    foreach ($payload['process'] ?? [] as $row) {
        if (isset($row['id'])) {
            $processIds[] = (int) $row['id'];
        }
    }
    $processIds = cda_normalize_ids($processIds);
    if ($processIds !== []) {
        cda_add_rows($payload, 'process_day', cda_fetch_by_column($pdo, 'process_day', 'process_id', $processIds));
    }

    $captureIds = [];
    foreach ($payload['data_captures'] ?? [] as $row) {
        if (isset($row['id'])) {
            $captureIds[] = (int) $row['id'];
        }
    }
    $captureIds = cda_normalize_ids($captureIds);
    if ($captureIds !== [] && cda_table_exists($pdo, 'data_capture_details') && empty($payload['data_capture_details'])) {
        cda_add_rows($payload, 'data_capture_details', cda_fetch_by_column($pdo, 'data_capture_details', 'capture_id', $captureIds));
    }

    if ($orphanAccountIds !== []) {
        cda_add_rows($payload, 'account', cda_fetch_by_column($pdo, 'account', 'id', $orphanAccountIds));
        cda_add_rows($payload, 'account_currency', cda_fetch_by_column($pdo, 'account_currency', 'account_id', $orphanAccountIds));
        if (cda_table_exists($pdo, 'account_currency_display_order')) {
            cda_add_rows(
                $payload,
                'account_currency_display_order',
                cda_fetch_by_column($pdo, 'account_currency_display_order', 'account_id', $orphanAccountIds)
            );
        }
    }

    $txIds = cda_collect_transaction_ids($pdo, $companyId, $accountIds);
    if ($txIds !== []) {
        cda_add_rows($payload, 'transactions', cda_fetch_by_column($pdo, 'transactions', 'id', $txIds));
        if (cda_table_exists($pdo, 'transaction_entry')) {
            $entryCol = cda_has_column($pdo, 'transaction_entry', 'header_id') ? 'header_id' : 'transaction_id';
            if (cda_has_column($pdo, 'transaction_entry', $entryCol)) {
                cda_add_rows($payload, 'transaction_entry', cda_fetch_by_column($pdo, 'transaction_entry', $entryCol, $txIds));
            }
        }
        if (cda_table_exists($pdo, 'transactions_rate')) {
            cda_add_rows($payload, 'transactions_rate', cda_fetch_by_column($pdo, 'transactions_rate', 'transaction_id', $txIds));
        }
        if (cda_table_exists($pdo, 'transactions_rate_details')) {
            cda_add_rows($payload, 'transactions_rate_details', cda_fetch_by_column($pdo, 'transactions_rate_details', 'transaction_id', $txIds));
        }
    }

    if (cda_table_exists($pdo, 'transactions_deleted') && cda_has_column($pdo, 'transactions_deleted', 'company_id')) {
        cda_add_by_company_id($pdo, $payload, 'transactions_deleted', $companyId);
    }
    if (cda_table_exists($pdo, 'data_captures_deleted') && cda_has_column($pdo, 'data_captures_deleted', 'company_id')) {
        cda_add_by_company_id($pdo, $payload, 'data_captures_deleted', $companyId);
    }

    return $payload;
}

function company_deletion_archive_row_counts(array $payload): array
{
    $counts = [];
    foreach ($payload as $table => $rows) {
        if (is_array($rows)) {
            $counts[$table] = count($rows);
        }
    }
    return $counts;
}

/**
 * Archive companies before Domain cascade delete.
 *
 * @param list<int> $companyDbIds
 * @return list<int> archive row ids
 */
function company_deletion_archive_before_delete(PDO $pdo, array $companyDbIds, ?int $ownerId, array $actor = []): array
{
    company_deletion_archive_ensure_table($pdo);
    $companyDbIds = cda_normalize_ids($companyDbIds);
    if ($companyDbIds === []) {
        return [];
    }

    $ownerCode = null;
    $ownerName = null;
    if ($ownerId) {
        try {
            $st = $pdo->prepare('SELECT owner_code, name FROM owner WHERE id = ? LIMIT 1');
            $st->execute([$ownerId]);
            $or = $st->fetch(PDO::FETCH_ASSOC);
            if ($or) {
                $ownerCode = $or['owner_code'] ?? null;
                $ownerName = $or['name'] ?? null;
            }
        } catch (Throwable $e) {
            // ignore
        }
    }

    $archiveIds = [];
    $insert = $pdo->prepare(
        'INSERT INTO company_deletion_archive (
            company_db_id, company_code, owner_id, owner_code, owner_name, group_id,
            deleted_by_user_id, deleted_by_owner_id, deleted_by_login,
            row_counts, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    foreach ($companyDbIds as $companyId) {
        $payload = company_deletion_archive_collect_payload($pdo, $companyId);
        if ($payload === [] || empty($payload['company'][0])) {
            continue;
        }
        $companyRow = $payload['company'][0];
        $counts = company_deletion_archive_row_counts($payload);
        $insert->execute([
            $companyId,
            (string) ($companyRow['company_id'] ?? ''),
            $ownerId ?: ($companyRow['owner_id'] ?? null),
            $ownerCode,
            $ownerName,
            $companyRow['group_id'] ?? null,
            $actor['deleted_by_user_id'] ?? null,
            $actor['deleted_by_owner_id'] ?? null,
            $actor['deleted_by_login'] ?? null,
            json_encode($counts, JSON_UNESCAPED_UNICODE),
            json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);
        $archiveIds[] = (int) $pdo->lastInsertId();
    }

    return $archiveIds;
}

/** Restore table insert order (parents before children). */
function company_deletion_archive_restore_order(): array
{
    return [
        'company',
        'company_ownership',
        'company_auto_renew_request',
        'company_countries',
        'company_selected_banks',
        'company_selected_countries',
        'currency',
        'description',
        'account',
        'account_company',
        'account_currency',
        'account_currency_display_order',
        'account_link',
        'process',
        'process_day',
        'data_captures',
        'data_capture_details',
        'data_capture_templates',
        'data_capture_summary_state',
        'data_capture_submit_queue',
        'submitted_processes',
        'transactions',
        'transaction_entry',
        'transactions_rate',
        'transactions_rate_details',
        'bank_process',
        'process_accounting_posted',
        'process_accounting_due_dismissed',
        'bank_process_accounting_resend_daily_guard',
        'bank_process_maintenance_resend_pending',
        'country_bank',
        'user_company_map',
        'user_company_permissions',
        'transactions_deleted',
        'data_captures_deleted',
    ];
}

function company_deletion_archive_insert_rows(PDO $pdo, string $table, array $rows): int
{
    if ($rows === [] || !cda_table_exists($pdo, $table)) {
        return 0;
    }
    $inserted = 0;
    foreach ($rows as $row) {
        if (!is_array($row) || $row === []) {
            continue;
        }
        $cols = array_keys($row);
        $colList = implode('`, `', $cols);
        $ph = implode(', ', array_fill(0, count($cols), '?'));
        $sql = "INSERT IGNORE INTO `$table` (`$colList`) VALUES ($ph)";
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($row));
            $inserted += $stmt->rowCount();
        } catch (Throwable $e) {
            error_log("company_deletion_archive insert $table: " . $e->getMessage());
            throw $e;
        }
    }
    return $inserted;
}

/**
 * @return array{archive_id:int, company_db_id:int, company_code:string, inserted:array<string,int>}
 */
function company_deletion_archive_restore(PDO $pdo, int $archiveId, string $restoredByLogin = ''): array
{
    company_deletion_archive_ensure_table($pdo);
    $stmt = $pdo->prepare('SELECT * FROM company_deletion_archive WHERE id = ? LIMIT 1');
    $stmt->execute([$archiveId]);
    $archive = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$archive) {
        throw new RuntimeException('Archive not found');
    }
    if (($archive['status'] ?? '') === 'restored') {
        throw new RuntimeException('This company was already restored');
    }

    $payload = json_decode((string) ($archive['payload'] ?? ''), true);
    if (!is_array($payload) || empty($payload['company'][0])) {
        throw new RuntimeException('Invalid archive payload');
    }

    $companyDbId = (int) ($archive['company_db_id'] ?? 0);
    $companyCode = trim((string) ($archive['company_code'] ?? ''));

    if ($companyDbId > 0 && cda_table_exists($pdo, 'company')) {
        $chk = $pdo->prepare('SELECT id FROM company WHERE id = ? LIMIT 1');
        $chk->execute([$companyDbId]);
        if ($chk->fetchColumn()) {
            throw new RuntimeException("Company id {$companyDbId} already exists; cannot restore.");
        }
    }
    if ($companyCode !== '') {
        $chk = $pdo->prepare('SELECT id FROM company WHERE UPPER(TRIM(company_id)) = ? LIMIT 1');
        $chk->execute([strtoupper($companyCode)]);
        if ($chk->fetchColumn()) {
            throw new RuntimeException("Company code {$companyCode} already exists; cannot restore.");
        }
    }

    $inserted = [];
    $order = company_deletion_archive_restore_order();
    $seen = array_flip($order);

    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    try {
        foreach ($order as $table) {
            if (!empty($payload[$table])) {
                $inserted[$table] = company_deletion_archive_insert_rows($pdo, $table, $payload[$table]);
            }
        }
        foreach ($payload as $table => $rows) {
            if (isset($seen[$table]) || !is_array($rows) || $rows === []) {
                continue;
            }
            $inserted[$table] = company_deletion_archive_insert_rows($pdo, $table, $rows);
        }

        $upd = $pdo->prepare(
            "UPDATE company_deletion_archive SET status = 'restored', restored_at = NOW(), restored_by_login = ? WHERE id = ?"
        );
        $upd->execute([$restoredByLogin, $archiveId]);
    } finally {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    return [
        'archive_id' => $archiveId,
        'company_db_id' => $companyDbId,
        'company_code' => $companyCode,
        'inserted' => $inserted,
    ];
}

/**
 * @return list<array<string,mixed>>
 */
function company_deletion_archive_list(PDO $pdo, ?string $status = 'deleted', int $limit = 100): array
{
    company_deletion_archive_ensure_table($pdo);
    $limit = max(1, min(500, $limit));
    if ($status !== null && $status !== '') {
        $stmt = $pdo->prepare(
            "SELECT id, company_db_id, company_code, owner_id, owner_code, owner_name, group_id,
                    deleted_by_login, deleted_at, restored_at, restored_by_login, status, row_counts
             FROM company_deletion_archive
             WHERE status = ?
             ORDER BY deleted_at DESC
             LIMIT $limit"
        );
        $stmt->execute([$status]);
    } else {
        $stmt = $pdo->query(
            "SELECT id, company_db_id, company_code, owner_id, owner_code, owner_name, group_id,
                    deleted_by_login, deleted_at, restored_at, restored_by_login, status, row_counts
             FROM company_deletion_archive
             ORDER BY deleted_at DESC
             LIMIT $limit"
        );
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as &$row) {
        if (!empty($row['row_counts']) && is_string($row['row_counts'])) {
            $decoded = json_decode($row['row_counts'], true);
            $row['row_counts'] = is_array($decoded) ? $decoded : [];
        }
        $total = 0;
        if (is_array($row['row_counts'])) {
            foreach ($row['row_counts'] as $c) {
                $total += (int) $c;
            }
        }
        $row['total_rows'] = $total;
    }
    unset($row);
    return $rows;
}
