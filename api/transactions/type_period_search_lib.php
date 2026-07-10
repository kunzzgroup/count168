<?php
/**
 * Type Search × Capture Date: period-scoped metrics with all-time account eligibility.
 * Phase 1: CONTRA (pure manual, To + From account perspectives).
 */

require_once __DIR__ . '/transaction_scope.php';
require_once __DIR__ . '/type_pure_manual_filter_lib.php';
require_once __DIR__ . '/type_account_search_lib.php';
require_once __DIR__ . '/dcd_processed_quant.php';
require_once __DIR__ . '/../includes/transaction_approval.php';
require_once __DIR__ . '/../includes/money_decimal.php';

function typePeriodSearchTxnHasCurrencyId(PDO $pdo): bool
{
    static $has = null;
    if ($has !== null) {
        return $has;
    }
    try {
        $st = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'currency_id'");
        $has = $st && $st->rowCount() > 0;
    } catch (Throwable $e) {
        $has = false;
    }

    return $has;
}

/**
 * @return array{sql: string, bind: int}
 */
function typePeriodSearchCurrencyJoin(PDO $pdo, array $listScope): array
{
    $isGroup = (($listScope['mode'] ?? '') === 'group');
    $groupScopeId = (int) ($listScope['group_scope_id'] ?? 0);
    if (
        $isGroup
        && function_exists('tenant_table_has_scope_columns')
        && tenant_table_has_scope_columns($pdo, 'currency')
        && $groupScopeId > 0
    ) {
        return [
            'sql' => "INNER JOIN currency c ON t.currency_id = c.id AND c.scope_type = 'group' AND c.scope_id = ?",
            'bind' => $groupScopeId,
        ];
    }

    $permId = tx_permission_company_id_for_scope($pdo, $listScope);
    $subsidiarySql = function_exists('tenant_sql_currency_subsidiary_only')
        ? tenant_sql_currency_subsidiary_only($pdo, 'c')
        : '';

    return [
        'sql' => "INNER JOIN currency c ON t.currency_id = c.id AND c.company_id = ?{$subsidiarySql}",
        'bind' => $permId > 0 ? $permId : (int) ($listScope['company_id'] ?? 0),
    ];
}

/**
 * @return string[]
 */
function typePeriodSearchSupportedFormTypes(): array
{
    return ['CONTRA'];
}

function typePeriodSearchIsSupported(string $formType): bool
{
    return in_array(strtoupper(trim($formType)), typePeriodSearchSupportedFormTypes(), true);
}

/**
 * Accounts that ever had pure manual CONTRA (To or From side).
 *
 * @return int[]
 */
function typePeriodSearchFetchEligibleAccountIds(PDO $pdo, array $listScope, string $formType): array
{
    $formType = strtoupper(trim($formType));
    if ($formType !== 'CONTRA') {
        return typeAccountSearchFetchAccountIds($pdo, $listScope, $formType);
    }

    $txnFilter = tx_search_transaction_filter($pdo, $listScope, 't');
    $approvalSql = tx_sql_transaction_approval_where($pdo, 't');
    $bankDescSql = typeAccountSearchBankProcessDescriptionExcludeSql('t');
    $bankSrcSql = typeAccountSearchHasSourceBankProcessColumn($pdo)
        ? typeAccountSearchSourceBankProcessExcludeSql('t')
        : '';
    $pureManualSql = typeTxSearchPureManualSqlFragment('CONTRA', 't');

    $queries = [
        "SELECT DISTINCT t.account_id AS account_id
         FROM transactions t
         WHERE {$txnFilter['sql']}
           AND t.account_id IS NOT NULL
           AND t.account_id > 0
           AND t.transaction_type = 'CONTRA'
           {$approvalSql}
           {$bankDescSql}
           {$bankSrcSql}
           {$pureManualSql}",
        "SELECT DISTINCT t.from_account_id AS account_id
         FROM transactions t
         WHERE {$txnFilter['sql']}
           AND t.from_account_id IS NOT NULL
           AND t.from_account_id > 0
           AND t.transaction_type = 'CONTRA'
           {$approvalSql}
           {$bankDescSql}
           {$bankSrcSql}
           {$pureManualSql}",
    ];

    $ids = [];
    foreach ($queries as $sql) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([(int) $txnFilter['bind']]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $id = (int) ($row['account_id'] ?? 0);
            if ($id > 0) {
                $ids[$id] = true;
            }
        }
    }

    return array_map('intval', array_keys($ids));
}

/**
 * @param array<int, array<int, string>> $bucket
 */
function typePeriodSearchAccumulateBucketRow(array &$bucket, int $accountId, int $currencyId, string $amount): void
{
    if ($accountId <= 0 || $currencyId <= 0) {
        return;
    }
    $bucket[$accountId][$currencyId] = money_add($bucket[$accountId][$currencyId] ?? '0', money_out($amount), 8);
}

/**
 * @param 'to'|'from' $side
 * @param int[] $accountIds
 * @param string[] $currencyCodes
 * @return array{bf: array<int, array<int, string>>, cr_dr: array<int, array<int, string>>, currencies: array<int, array<int, string>>}
 */
function typePeriodSearchFetchContraSideMetrics(
    PDO $pdo,
    array $listScope,
    string $dateFromDb,
    string $dateToDb,
    array $accountIds,
    array $currencyCodes,
    string $side
): array {
    $empty = ['bf' => [], 'cr_dr' => [], 'currencies' => []];
    $accountIds = array_values(array_unique(array_filter(array_map('intval', $accountIds), static fn (int $id): bool => $id > 0)));
    if ($accountIds === [] || !in_array($side, ['to', 'from'], true)) {
        return $empty;
    }

    $txnFilter = tx_search_transaction_filter($pdo, $listScope, 't');
    $approvalSql = tx_sql_transaction_approval_where($pdo, 't');
    $bankDescSql = typeAccountSearchBankProcessDescriptionExcludeSql('t');
    $bankSrcSql = typeAccountSearchHasSourceBankProcessColumn($pdo)
        ? typeAccountSearchSourceBankProcessExcludeSql('t')
        : '';
    $pureManualSql = typeTxSearchPureManualSqlFragment('CONTRA', 't');
    $signedAmt = $side === 'to'
        ? dcd_processed_amount_sql_quant2('(-t.amount)')
        : dcd_processed_amount_sql_quant2('t.amount');
    $dateExpr = 'DATE(t.transaction_date)';
    $accountCol = $side === 'to' ? 't.account_id' : 't.from_account_id';

    $accPh = implode(',', array_fill(0, count($accountIds), '?'));
    $sql = "SELECT
                {$accountCol} AS account_id,
                t.currency_id,
                COALESCE((
                    SELECT UPPER(TRIM(c2.code))
                    FROM currency c2
                    WHERE c2.id = t.currency_id
                    LIMIT 1
                ), '') AS currency_code,
                COALESCE(SUM(CASE WHEN {$dateExpr} < ? THEN {$signedAmt} ELSE 0 END), 0) AS bf_total,
                COALESCE(SUM(CASE WHEN {$dateExpr} BETWEEN ? AND ? THEN {$signedAmt} ELSE 0 END), 0) AS cr_dr_total
            FROM transactions t
            WHERE {$txnFilter['sql']}
              AND {$accountCol} IN ({$accPh})
              AND t.transaction_type = 'CONTRA'
              AND t.currency_id IS NOT NULL
              {$approvalSql}
              {$bankDescSql}
              {$bankSrcSql}
              {$pureManualSql}";

    $params = [
        $dateFromDb,
        $dateFromDb,
        $dateToDb,
        (int) $txnFilter['bind'],
    ];
    $params = array_merge($params, $accountIds);

    if ($currencyCodes !== []) {
        $curPh = implode(',', array_fill(0, count($currencyCodes), '?'));
        $sql .= " AND EXISTS (
            SELECT 1
            FROM currency c
            WHERE c.id = t.currency_id
              AND UPPER(TRIM(c.code)) IN ({$curPh})
        )";
        $params = array_merge($params, $currencyCodes);
    }

    $sql .= " GROUP BY {$accountCol}, t.currency_id";

    $bf = [];
    $crDr = [];
    $currencies = [];
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $aid = (int) ($row['account_id'] ?? 0);
        $cid = (int) ($row['currency_id'] ?? 0);
        $code = strtoupper(trim((string) ($row['currency_code'] ?? '')));
        if ($aid <= 0 || $cid <= 0 || $code === '') {
            continue;
        }
        $bf[$aid][$cid] = money_out($row['bf_total'] ?? '0');
        $crDr[$aid][$cid] = money_out($row['cr_dr_total'] ?? '0');
        $currencies[$aid][$cid] = $code;
    }

    return [
        'bf' => $bf,
        'cr_dr' => $crDr,
        'currencies' => $currencies,
    ];
}

/**
 * Bulk pure CONTRA metrics per account + currency (To: -amount, From: +amount).
 *
 * @param int[] $accountIds
 * @param string[] $currencyCodes upper codes; empty = all
 * @return array{
 *   bf: array<int, array<int, string>>,
 *   cr_dr: array<int, array<int, string>>,
 *   currencies: array<int, array<int, string>>
 * }
 */
function typePeriodSearchBulkContraMetrics(
    PDO $pdo,
    array $listScope,
    string $dateFromDb,
    string $dateToDb,
    array $accountIds,
    array $currencyCodes = []
): array {
    $empty = ['bf' => [], 'cr_dr' => [], 'currencies' => []];
    $accountIds = array_values(array_unique(array_filter(array_map('intval', $accountIds), static fn (int $id): bool => $id > 0)));
    if ($accountIds === []) {
        return $empty;
    }

    if (!typePeriodSearchTxnHasCurrencyId($pdo)) {
        return $empty;
    }

    $currencyCodes = array_values(array_unique(array_filter(array_map(
        static fn ($c) => strtoupper(trim((string) $c)),
        $currencyCodes
    ), static fn (string $c): bool => $c !== '')));

    $toSide = typePeriodSearchFetchContraSideMetrics(
        $pdo,
        $listScope,
        $dateFromDb,
        $dateToDb,
        $accountIds,
        $currencyCodes,
        'to'
    );
    $fromSide = typePeriodSearchFetchContraSideMetrics(
        $pdo,
        $listScope,
        $dateFromDb,
        $dateToDb,
        $accountIds,
        $currencyCodes,
        'from'
    );

    $bf = [];
    $crDr = [];
    $currencies = [];
    foreach ([$toSide, $fromSide] as $sidePack) {
        foreach ($sidePack['bf'] ?? [] as $aid => $byCur) {
            foreach ($byCur as $cid => $amt) {
                typePeriodSearchAccumulateBucketRow($bf, (int) $aid, (int) $cid, $amt);
            }
        }
        foreach ($sidePack['cr_dr'] ?? [] as $aid => $byCur) {
            foreach ($byCur as $cid => $amt) {
                typePeriodSearchAccumulateBucketRow($crDr, (int) $aid, (int) $cid, $amt);
            }
        }
        foreach ($sidePack['currencies'] ?? [] as $aid => $byCur) {
            foreach ($byCur as $cid => $code) {
                $currencies[(int) $aid][(int) $cid] = (string) $code;
            }
        }
    }

    return [
        'bf' => $bf,
        'cr_dr' => $crDr,
        'currencies' => $currencies,
    ];
}

/**
 * @param array{
 *   bf?: array<int, array<int, string>>,
 *   cr_dr?: array<int, array<int, string>>,
 *   currencies?: array<int, array<int, string>>
 * } $bulk
 */
function typePeriodSearchMetricForCombo(
    array $bulk,
    string $bucketKey,
    int $accountId,
    int $currencyId,
    string $currencyCode = ''
): string {
    $bucket = $bulk[$bucketKey] ?? [];
    if (isset($bucket[$accountId][$currencyId])) {
        return money_out($bucket[$accountId][$currencyId]);
    }

    $wantCode = strtoupper(trim($currencyCode));
    if ($wantCode === '' || empty($bulk['currencies'][$accountId])) {
        return '0.00';
    }

    $total = '0';
    foreach ($bulk['currencies'][$accountId] as $cid => $code) {
        if (strtoupper(trim((string) $code)) !== $wantCode) {
            continue;
        }
        if (isset($bucket[$accountId][(int) $cid])) {
            $total = money_add($total, $bucket[$accountId][(int) $cid], 8);
        }
    }

    return money_out($total);
}

/**
 * @param array<int, array<int, string>> $bucket
 */
function typePeriodSearchMetricFor(array $bucket, int $accountId, int $currencyId): string
{
    return money_out($bucket[$accountId][$currencyId] ?? '0');
}
