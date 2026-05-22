<?php
/**
 * Repair account rows with invalid primary key id=0 and resolve account PK from request fields.
 */

function accountFormatDomainAutoDisplayCode(string $rawAccountId): string {
    $rawAccountId = trim($rawAccountId);
    if ($rawAccountId === '') {
        return $rawAccountId;
    }

    if (strpos($rawAccountId, '_') !== false) {
        $parts = explode('_', $rawAccountId);
        $count = count($parts);
        if ($count >= 3) {
            $last = trim((string)$parts[count($parts) - 1]);
            $prev = trim((string)$parts[count($parts) - 2]);
            if ($last !== '' && ctype_digit($last) && $prev !== '') {
                return $prev;
            }
        }
        if ($count >= 2) {
            $last = trim((string)$parts[$count - 1]);
            if ($last !== '') {
                return $last;
            }
        }
    }

    return $rawAccountId;
}

function accountTableHasColumn(PDO $pdo, string $table, string $column): bool {
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);
    $cache[$key] = ((int)$stmt->fetchColumn()) > 0;
    return $cache[$key];
}

function accountUpdateZeroIdReferences(PDO $pdo, int $newId): void {
    $updates = [
        ['account_company', 'account_id'],
        ['account_currency', 'account_id'],
        ['account_currency_display_order', 'account_id'],
        ['account_link', 'account_id_1'],
        ['account_link', 'account_id_2'],
        ['account_link', 'source_account_id'],
    ];

    foreach ($updates as [$table, $column]) {
        if (!accountTableHasColumn($pdo, $table, $column)) {
            continue;
        }
        $stmt = $pdo->prepare("UPDATE `$table` SET `$column` = ? WHERE `$column` = 0");
        $stmt->execute([$newId]);
    }
}

function repairAccountZeroPrimaryKey(PDO $pdo, string $accountCode, int $companyId = 0): int {
    $accountCode = trim($accountCode);
    if ($accountCode === '') {
        return 0;
    }

    $findSql = "
        SELECT a.id, a.account_id
        FROM account a
        WHERE a.id = 0 AND UPPER(TRIM(a.account_id)) = UPPER(TRIM(?))
        LIMIT 1
    ";
    $find = $pdo->prepare($findSql);
    $find->execute([$accountCode]);
    $row = $find->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return 0;
    }

    if ($companyId > 0) {
        $co = $pdo->prepare("
            SELECT 1 FROM account_company
            WHERE account_id = 0 AND company_id = ?
            LIMIT 1
        ");
        $co->execute([$companyId]);
        if (!$co->fetchColumn()) {
            return 0;
        }
    }

    $pdo->beginTransaction();
    try {
        $maxStmt = $pdo->query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM account FOR UPDATE');
        $newId = (int)$maxStmt->fetchColumn();
        if ($newId <= 0) {
            $newId = 1;
        }

        accountUpdateZeroIdReferences($pdo, $newId);

        $updAcc = $pdo->prepare("
            UPDATE account
            SET id = ?
            WHERE id = 0 AND UPPER(TRIM(account_id)) = UPPER(TRIM(?))
            LIMIT 1
        ");
        $updAcc->execute([$newId, $accountCode]);
        if ($updAcc->rowCount() === 0) {
            $pdo->rollBack();
            return 0;
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('repairAccountZeroPrimaryKey failed: ' . $e->getMessage());
        return 0;
    }

    try {
        $pdo->exec('ALTER TABLE account AUTO_INCREMENT = ' . ($newId + 1));
    } catch (Throwable $e) {
        error_log('repairAccountZeroPrimaryKey AUTO_INCREMENT update skipped: ' . $e->getMessage());
    }

    error_log("repairAccountZeroPrimaryKey: repaired account '$accountCode' from id=0 to id=$newId");
    return $newId;
}

function resolveAccountPk(PDO $pdo, int $companyId, int $numericPk, string $accountCode, string $displayCode): int {
    if ($numericPk > 0) {
        $stmt = $pdo->prepare("
            SELECT a.id FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE a.id = ? AND ac.company_id = ?
            LIMIT 1
        ");
        $stmt->execute([$numericPk, $companyId]);
        $found = (int)$stmt->fetchColumn();
        if ($found > 0) {
            return $found;
        }
    }

    $needles = [];
    foreach ([$accountCode, $displayCode] as $code) {
        $code = strtoupper(trim($code));
        if ($code !== '') {
            $needles[$code] = true;
        }
    }
    if (empty($needles)) {
        return 0;
    }

    foreach (array_keys($needles) as $needle) {
        $stmt = $pdo->prepare("
            SELECT a.id, a.account_id FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE ac.company_id = ? AND UPPER(TRIM(a.account_id)) = ?
            LIMIT 1
        ");
        $stmt->execute([$companyId, $needle]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            continue;
        }
        $found = (int)($row['id'] ?? 0);
        if ($found > 0) {
            return $found;
        }
        $repaired = repairAccountZeroPrimaryKey($pdo, (string)($row['account_id'] ?? $needle), $companyId);
        if ($repaired > 0) {
            return $repaired;
        }
    }

    $stmt = $pdo->prepare("
        SELECT a.id, a.account_id FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE ac.company_id = ?
    ");
    $stmt->execute([$companyId]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $raw = strtoupper(trim((string)($row['account_id'] ?? '')));
        if ($raw === '') {
            continue;
        }
        $display = strtoupper(trim(accountFormatDomainAutoDisplayCode((string)$row['account_id'])));
        $foundId = (int)($row['id'] ?? 0);
        foreach (array_keys($needles) as $needle) {
            if ($raw === $needle || $display === $needle) {
                if ($foundId <= 0) {
                    $repaired = repairAccountZeroPrimaryKey($pdo, (string)$row['account_id'], $companyId);
                    return $repaired > 0 ? $repaired : 0;
                }
                return $foundId;
            }
        }
    }

    foreach (array_keys($needles) as $needle) {
        $repaired = repairAccountZeroPrimaryKey($pdo, $needle, $companyId);
        if ($repaired > 0) {
            return $repaired;
        }
    }

    return 0;
}

function ensureAccountInsertId(PDO $pdo, int $insertId, string $accountCode, int $companyId = 0): int {
    if ($insertId > 0) {
        return $insertId;
    }

    $stmt = $pdo->prepare("
        SELECT id FROM account
        WHERE UPPER(TRIM(account_id)) = UPPER(TRIM(?))
        ORDER BY id DESC
        LIMIT 1
    ");
    $stmt->execute([$accountCode]);
    $found = (int)$stmt->fetchColumn();
    if ($found > 0) {
        return $found;
    }

    return repairAccountZeroPrimaryKey($pdo, $accountCode, $companyId);
}
