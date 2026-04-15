<?php
/**
 * 维护页删除 Bank process 来源的 transactions 后，记录「Resend → Accounting Due」待办。
 * Resend 成功时清除该 bank_process 下全部 process_accounting_posted（避免只删了部分 period 时残留 PAP 导致 Inbox 少行）。
 * Resend 成功后可置 accounting_resend_relax_created_floor：Inbox / 入账推断里「创建日门槛」与 day_start 取较早者，避免用户修正 day_start 后仍被「旧数据不拿」挡住（正常新建流程不受影响）。
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

if (!function_exists('bmp_ensureBankProcessAccountingResendRelaxColumn')) {
    /** 若无列则 ALTER，避免未跑迁移时 Resend 无法置 accounting_resend_relax_created_floor */
    function bmp_ensureBankProcessAccountingResendRelaxColumn(PDO $pdo): void
    {
        if (bmp_resend_tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor')) {
            return;
        }
        try {
            $pdo->exec(
                "ALTER TABLE bank_process ADD COLUMN accounting_resend_relax_created_floor TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT '1=Resend 后 Inbox 放宽创建日门槛并允许多账期'"
            );
        } catch (Throwable $e) {
            // 并发重复添加等：忽略
        }
    }
}

if (!function_exists('bmp_ensureBankProcessAccountingResendScheduleColumns')) {
    /**
     * Resend 弹窗中的 day_start / day_end / frequency 不写入「编辑流程」字段，但入账与 Inbox 须与弹窗一致：
     * 在 accounting_resend_relax_created_floor=1 期间用下列暂存列覆盖计算；入账成功后与 relax 一并清空。
     */
    function bmp_ensureBankProcessAccountingResendScheduleColumns(PDO $pdo): void
    {
        $defs = [
            'accounting_resend_schedule_day_start' => "DATE NULL COMMENT 'Resend 弹窗 day_start，仅 relax 期间'",
            'accounting_resend_schedule_day_end' => "DATE NULL COMMENT 'Resend 弹窗 day_end，仅 relax 期间'",
            'accounting_resend_schedule_frequency' => "VARCHAR(40) NULL COMMENT 'monthly 或 1st_of_every_month，仅 relax 期间'",
        ];
        foreach ($defs as $col => $ddlTail) {
            if (bmp_resend_tableHasColumn($pdo, 'bank_process', $col)) {
                continue;
            }
            try {
                $pdo->exec("ALTER TABLE bank_process ADD COLUMN `$col` $ddlTail");
            } catch (Throwable $e) {
                // ignore
            }
        }
    }
}

if (!function_exists('bmp_bankProcessHasResendScheduleColumns')) {
    function bmp_bankProcessHasResendScheduleColumns(PDO $pdo): bool
    {
        return bmp_resend_tableHasColumn($pdo, 'bank_process', 'accounting_resend_schedule_day_start');
    }
}

/**
 * Resend 成功后 relax=1 时，用暂存列覆盖 day_start / day_end / day_start_frequency 供 Inbox 与入账推断（不改编辑表单里的持久字段）。
 *
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
if (!function_exists('bmp_mergeResendScheduleIntoBankProcessRowForAccounting')) {
    function bmp_mergeResendScheduleIntoBankProcessRowForAccounting(array $row): array
    {
        if (empty($row['accounting_resend_relax_created_floor'])) {
            unset(
                $row['accounting_resend_schedule_day_start'],
                $row['accounting_resend_schedule_day_end'],
                $row['accounting_resend_schedule_frequency'],
                $row['accounting_resend_single_period_from_schedule']
            );
            return $row;
        }
        $ds = $row['accounting_resend_schedule_day_start'] ?? null;
        $hadScheduleStart = $ds !== null && trim((string) $ds) !== '';
        if ($hadScheduleStart) {
            // 弹窗指定了 day_start：只补该锚点所在那一期（如 1/13→2/13），不按合同把后续月全部列进 Accounting Due。
            $row['accounting_resend_single_period_from_schedule'] = 1;
        }
        if ($hadScheduleStart) {
            $row['day_start'] = preg_match('/^(\d{4}-\d{2}-\d{2})/', (string) $ds, $m) ? $m[1] : $ds;
        }
        $de = $row['accounting_resend_schedule_day_end'] ?? null;
        if ($de !== null && trim((string) $de) !== '') {
            $row['day_end'] = preg_match('/^(\d{4}-\d{2}-\d{2})/', (string) $de, $m) ? $m[1] : $de;
        }
        $fq = isset($row['accounting_resend_schedule_frequency']) ? strtolower(trim((string) $row['accounting_resend_schedule_frequency'])) : '';
        if ($fq === 'monthly' || $fq === '1st_of_every_month') {
            $row['day_start_frequency'] = $fq;
        }
        unset(
            $row['accounting_resend_schedule_day_start'],
            $row['accounting_resend_schedule_day_end'],
            $row['accounting_resend_schedule_frequency']
        );
        return $row;
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

/**
 * Accounting Inbox / 入账推断：Resend 后放宽「旧数据不拿」的创建日门槛。
 * 将 effectiveCreated = min(dts_created 日, day_start)，使修正后的 day_start 不晚于创建日时仍可按新锚点排队。
 *
 * @param string $createdYmd 来自 dts_created 的 Y-m-d
 * @param string|null $dayStartYmd 解析后的 day_start（Y-m-d），无效时传 null
 */
if (!function_exists('bmp_inboxEffectiveCreatedYmd')) {
    function bmp_inboxEffectiveCreatedYmd(string $createdYmd, ?string $dayStartYmd, bool $relaxCreatedFloor): string
    {
        if (!$relaxCreatedFloor || $dayStartYmd === null || $dayStartYmd === '') {
            return $createdYmd;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayStartYmd)) {
            return $createdYmd;
        }
        return min($createdYmd, $dayStartYmd);
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
