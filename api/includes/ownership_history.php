<?php
/**
 * Monthly ownership snapshot helpers.
 * Saves on confirm: archive by calendar month (last save in month wins).
 */

function ownership_history_ensure_tables(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS company_ownership_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            effective_month DATE NOT NULL,
            account_id INT NOT NULL,
            owner_type ENUM('account','owner','user','group') NOT NULL DEFAULT 'account',
            percentage DECIMAL(6,2) NOT NULL DEFAULT 0.00,
            partner_group_id VARCHAR(50) DEFAULT NULL,
            read_only TINYINT(1) NOT NULL DEFAULT 1,
            saved_by INT DEFAULT NULL,
            saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_co_hist_month_account (company_id, effective_month, account_id, owner_type),
            KEY idx_co_hist_company_month (company_id, effective_month)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_ownership_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(50) NOT NULL,
            owner_id INT NOT NULL DEFAULT 0,
            effective_month DATE NOT NULL,
            account_id INT NOT NULL,
            owner_type ENUM('owner','user','group') NOT NULL DEFAULT 'owner',
            percentage DECIMAL(6,2) NOT NULL DEFAULT 0.00,
            partner_group_id VARCHAR(50) DEFAULT NULL,
            read_only TINYINT(1) NOT NULL DEFAULT 1,
            saved_by INT DEFAULT NULL,
            saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_go_hist_month_account (group_id, effective_month, account_id, owner_type),
            KEY idx_go_hist_group_month (group_id, effective_month)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

function ownership_history_effective_month_from_now(): string
{
    return date('Y-m-01');
}

function ownership_history_current_month_key(): string
{
    return date('Y-m');
}

/** @return array{month_key: string, effective_month: string}|null */
function ownership_history_parse_month_param(?string $raw): ?array
{
    if ($raw === null || trim($raw) === '') {
        return null;
    }
    $raw = trim($raw);
    if (!preg_match('/^(\d{4})-(\d{2})$/', $raw, $m)) {
        return null;
    }
    $year = (int) $m[1];
    $mon = (int) $m[2];
    if ($mon < 1 || $mon > 12) {
        return null;
    }
    return [
        'month_key' => sprintf('%04d-%02d', $year, $mon),
        'effective_month' => sprintf('%04d-%02d-01', $year, $mon),
    ];
}

function ownership_history_is_past_month(string $monthKey): bool
{
    return $monthKey < ownership_history_current_month_key();
}

/**
 * @param list<array{account_id:int,owner_type:string,percentage:string,partner_group_id:?string,read_only:int}> $rows
 */
function ownership_history_save_company(PDO $pdo, int $companyId, array $rows, ?int $savedBy): void
{
    ownership_history_ensure_tables($pdo);
    $effectiveMonth = ownership_history_effective_month_from_now();

    $del = $pdo->prepare('DELETE FROM company_ownership_history WHERE company_id = ? AND effective_month = ?');
    $del->execute([$companyId, $effectiveMonth]);

    if (count($rows) === 0) {
        return;
    }

    $ins = $pdo->prepare('
        INSERT INTO company_ownership_history
            (company_id, effective_month, account_id, owner_type, percentage, partner_group_id, read_only, saved_by, saved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ');
    foreach ($rows as $row) {
        $ins->execute([
            $companyId,
            $effectiveMonth,
            (int) $row['account_id'],
            $row['owner_type'],
            $row['percentage'],
            $row['partner_group_id'],
            (int) $row['read_only'],
            $savedBy,
        ]);
    }
}

/**
 * @param list<array{account_id:int,owner_type:string,percentage:string,partner_group_id:?string,read_only:int}> $rows
 */
function ownership_history_save_group(PDO $pdo, string $groupId, int $ownerId, array $rows, ?int $savedBy): void
{
    ownership_history_ensure_tables($pdo);
    $effectiveMonth = ownership_history_effective_month_from_now();

    $del = $pdo->prepare('DELETE FROM group_ownership_history WHERE group_id = ? AND effective_month = ?');
    $del->execute([$groupId, $effectiveMonth]);

    if (count($rows) === 0) {
        return;
    }

    $ins = $pdo->prepare('
        INSERT INTO group_ownership_history
            (group_id, owner_id, effective_month, account_id, owner_type, percentage, partner_group_id, read_only, saved_by, saved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ');
    foreach ($rows as $row) {
        $ins->execute([
            $groupId,
            $ownerId,
            $effectiveMonth,
            (int) $row['account_id'],
            $row['owner_type'],
            $row['percentage'],
            $row['partner_group_id'],
            (int) $row['read_only'],
            $savedBy,
        ]);
    }
}

/** @return array{saved_at: ?string, has_snapshot: bool} */
function ownership_history_company_meta(PDO $pdo, int $companyId, string $effectiveMonth): array
{
    ownership_history_ensure_tables($pdo);
    $stmt = $pdo->prepare('
        SELECT MAX(saved_at) AS saved_at, COUNT(*) AS cnt
        FROM company_ownership_history
        WHERE company_id = ? AND effective_month = ?
    ');
    $stmt->execute([$companyId, $effectiveMonth]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $cnt = (int) ($row['cnt'] ?? 0);
    return [
        'saved_at' => $cnt > 0 ? (string) $row['saved_at'] : null,
        'has_snapshot' => $cnt > 0,
    ];
}

/** @return array{saved_at: ?string, has_snapshot: bool} */
function ownership_history_group_meta(PDO $pdo, string $groupId, string $effectiveMonth): array
{
    ownership_history_ensure_tables($pdo);
    $stmt = $pdo->prepare('
        SELECT MAX(saved_at) AS saved_at, COUNT(*) AS cnt
        FROM group_ownership_history
        WHERE group_id = ? AND effective_month = ?
    ');
    $stmt->execute([$groupId, $effectiveMonth]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $cnt = (int) ($row['cnt'] ?? 0);
    return [
        'saved_at' => $cnt > 0 ? (string) $row['saved_at'] : null,
        'has_snapshot' => $cnt > 0,
    ];
}
