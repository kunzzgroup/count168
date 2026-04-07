<?php
/**
 * 维护页删除 Bank process 来源的 transactions 后，记录「Resend → Accounting Due」待办。
 * Resend 时仅删除对应 process_accounting_posted，入账算法不变。
 */

if (!function_exists('bmp_resend_tableHasColumn')) {
    function bmp_resend_tableHasColumn(PDO $pdo, string $table, string $column): bool
    {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        return $stmt->rowCount() > 0;
    }
}

if (!function_exists('bmp_ensureMaintenanceResendPendingTable')) {
    function bmp_ensureMaintenanceResendPendingTable(PDO $pdo): void
    {
        $sql = "
            CREATE TABLE IF NOT EXISTS bank_process_maintenance_resend_pending (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT NOT NULL,
                bank_process_id INT NOT NULL,
                process_accounting_posted_id INT NULL,
                period_type VARCHAR(64) NOT NULL DEFAULT 'monthly',
                transaction_date DATE NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_bmp_resend_pap (process_accounting_posted_id),
                UNIQUE KEY uq_bmp_resend_fallback (company_id, bank_process_id, period_type, transaction_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ";
        $pdo->exec($sql);
    }
}

if (!function_exists('bmp_normalizePeriodType')) {
    function bmp_normalizePeriodType(?string $raw): string
    {
        $t = strtolower(trim((string) $raw));
        if ($t === 'partial_first_month' || $t === 'manual_inactive' || $t === 'day_end_tail') {
            return $t;
        }
        return 'monthly';
    }
}

if (!function_exists('bmp_resolveProcessAccountingPostedId')) {
    function bmp_resolveProcessAccountingPostedId(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $periodType,
        string $transactionDateYmd
    ): ?int {
        $stmtCh = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCh || $stmtCh->rowCount() === 0) {
            return null;
        }
        if (!bmp_resend_tableHasColumn($pdo, 'process_accounting_posted', 'period_type')) {
            return null;
        }

        $pt = bmp_normalizePeriodType($periodType);

        if ($pt === 'manual_inactive') {
            $stmt = $pdo->prepare(
                "SELECT id FROM process_accounting_posted
                 WHERE company_id = ? AND process_id = ?
                 AND period_type IN ('manual_inactive','manual_inactive_skipped')
                 ORDER BY posted_date DESC, id DESC LIMIT 1"
            );
            $stmt->execute([$companyId, $bankProcessId]);
            $id = $stmt->fetchColumn();
            return $id ? (int) $id : null;
        }

        $typeSets = [
            'monthly' => ['monthly', 'monthly_skipped'],
            'day_end_tail' => ['day_end_tail', 'day_end_tail_skipped'],
            'partial_first_month' => ['partial_first_month', 'partial_first_month_skipped'],
        ];
        $types = $typeSets[$pt] ?? ['monthly', 'monthly_skipped'];
        $in = implode(',', array_fill(0, count($types), '?'));

        $sql = "SELECT id FROM process_accounting_posted
                WHERE company_id = ? AND process_id = ?
                AND period_type IN ($in) AND posted_date = ? LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd]));
        $id = $stmt->fetchColumn();
        if ($id) {
            return (int) $id;
        }

        if ($pt === 'monthly' || $pt === 'day_end_tail') {
            $sql2 = "SELECT id FROM process_accounting_posted
                     WHERE company_id = ? AND process_id = ?
                     AND period_type IN ($in)
                     AND YEAR(posted_date) = YEAR(?) AND MONTH(posted_date) = MONTH(?)
                     LIMIT 1";
            $stmt2 = $pdo->prepare($sql2);
            $stmt2->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd, $transactionDateYmd]));
            $id2 = $stmt2->fetchColumn();
            return $id2 ? (int) $id2 : null;
        }

        return null;
    }
}

if (!function_exists('bmp_deletePapFallback')) {
    function bmp_deletePapFallback(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $periodType,
        string $transactionDateYmd
    ): int {
        if (!bmp_resend_tableHasColumn($pdo, 'process_accounting_posted', 'period_type')) {
            return 0;
        }
        $pt = bmp_normalizePeriodType($periodType);
        if ($pt === 'manual_inactive') {
            $stmt = $pdo->prepare(
                "DELETE FROM process_accounting_posted
                 WHERE company_id = ? AND process_id = ?
                 AND period_type IN ('manual_inactive','manual_inactive_skipped')
                 ORDER BY posted_date DESC, id DESC LIMIT 1"
            );
            $stmt->execute([$companyId, $bankProcessId]);
            return $stmt->rowCount();
        }
        $typeSets = [
            'monthly' => ['monthly', 'monthly_skipped'],
            'day_end_tail' => ['day_end_tail', 'day_end_tail_skipped'],
            'partial_first_month' => ['partial_first_month', 'partial_first_month_skipped'],
        ];
        $types = $typeSets[$pt] ?? ['monthly', 'monthly_skipped'];
        $in = implode(',', array_fill(0, count($types), '?'));
        $sql = "DELETE FROM process_accounting_posted
                WHERE company_id = ? AND process_id = ?
                AND period_type IN ($in) AND posted_date = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd]));
        $n = $stmt->rowCount();
        if ($n > 0 || ($pt !== 'monthly' && $pt !== 'day_end_tail')) {
            return $n;
        }
        $sql2 = "DELETE FROM process_accounting_posted
                 WHERE company_id = ? AND process_id = ?
                 AND period_type IN ($in)
                 AND YEAR(posted_date) = YEAR(?) AND MONTH(posted_date) = MONTH(?) LIMIT 1";
        $stmt2 = $pdo->prepare($sql2);
        $stmt2->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd, $transactionDateYmd]));
        return $stmt2->rowCount();
    }
}

if (!function_exists('bmp_recordResendPendingForTransactionIds')) {
    function bmp_recordResendPendingForTransactionIds(PDO $pdo, int $companyId, array $transactionIds): void
    {
        if (empty($transactionIds)) {
            return;
        }
        // IMPORTANT:
        // Do not run DDL (CREATE TABLE) inside a transaction, because MySQL may implicitly commit and
        // break the caller's transaction boundary (leading to "There is no active transaction" on commit()).
        // Call bmp_ensureMaintenanceResendPendingTable($pdo) BEFORE starting a DB transaction in the caller.

        $hasSource = bmp_resend_tableHasColumn($pdo, 'transactions', 'source_bank_process_id');
        if (!$hasSource) {
            return;
        }
        $hasPeriodCol = bmp_resend_tableHasColumn($pdo, 'transactions', 'source_bank_process_period_type');
        $periodExpr = $hasPeriodCol
            ? "COALESCE(NULLIF(TRIM(t.source_bank_process_period_type), ''), 'monthly')"
            : "'monthly'";

        $placeholders = implode(',', array_fill(0, count($transactionIds), '?'));
        $sql = "SELECT t.id, t.source_bank_process_id, DATE(t.transaction_date) AS txd, $periodExpr AS period_type
                FROM transactions t
                INNER JOIN account a ON t.account_id = a.id
                INNER JOIN account_company ac ON a.id = ac.account_id
                WHERE t.id IN ($placeholders) AND ac.company_id = ? AND t.source_bank_process_id IS NOT NULL";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($transactionIds, [$companyId]));
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $seenPap = [];
        $insPap = $pdo->prepare(
            "INSERT IGNORE INTO bank_process_maintenance_resend_pending
             (company_id, bank_process_id, process_accounting_posted_id, period_type, transaction_date)
             VALUES (?, ?, ?, ?, ?)"
        );
        $insFb = $pdo->prepare(
            "INSERT IGNORE INTO bank_process_maintenance_resend_pending
             (company_id, bank_process_id, process_accounting_posted_id, period_type, transaction_date)
             VALUES (?, ?, NULL, ?, ?)"
        );

        foreach ($rows as $r) {
            $bpId = (int) $r['source_bank_process_id'];
            if ($bpId <= 0) {
                continue;
            }
            $txd = $r['txd'] ?? null;
            $txdStr = $txd ? (string) $txd : '1970-01-01';
            $pt = bmp_normalizePeriodType($r['period_type'] ?? 'monthly');

            $papId = bmp_resolveProcessAccountingPostedId($pdo, $companyId, $bpId, $pt, $txdStr);
            if ($papId !== null && $papId > 0) {
                if (isset($seenPap[$papId])) {
                    continue;
                }
                $seenPap[$papId] = true;
                $insPap->execute([$companyId, $bpId, $papId, $pt, $txdStr]);
            } else {
                $insFb->execute([$companyId, $bpId, $pt, $txdStr]);
            }
        }
    }
}
