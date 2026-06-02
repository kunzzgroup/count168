<?php
/**
 * Transaction Dashboard API
 * 用于获取 Capital、Expenses 和 Profit 的汇总数据
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';

if (!$pdo instanceof PDO) {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed',
        'data' => null,
        'error' => 'Database connection failed',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
require_once __DIR__ . '/../../includes/permissions.php';
require_once __DIR__ . '/../includes/money_decimal.php';
require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/transaction_scope.php';
require_once __DIR__ . '/../reports/report_scope_common.php';

/**
 * Contra 审批：过滤未批准的 CONTRA（向后兼容：若无字段则不过滤）
 */
function dashboardHasContraApprovalColumns(PDO $pdo): bool
{
    static $has = null;
    if ($has !== null)
        return $has;
    $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'approval_status'");
    $has = $stmt->rowCount() > 0;
    return $has;
}

/**
 * 检查 transactions.currency_id 字段是否存在（static 缓存，每次请求只查一次）
 */
function dashboardHasTransactionCurrency(PDO $pdo): bool
{
    static $has = null;
    if ($has !== null)
        return $has;
    try {
        $check = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'currency_id'");
        $has = $check && $check->rowCount() > 0;
    } catch (Throwable $e) {
        $has = false;
    }
    return $has;
}

/**
 * 检查 transaction_entry 表是否存在（static 缓存，每次请求只查一次）
 */
function dashboardHasTransactionEntry(PDO $pdo): bool
{
    static $has = null;
    if ($has !== null)
        return $has;
    try {
        $check = $pdo->query("SHOW TABLES LIKE 'transaction_entry'");
        $has = $check && $check->rowCount() > 0;
    } catch (Throwable $e) {
        $has = false;
    }
    return $has;
}

/**
 * 检查 company_ownership 表及 owner_type 列是否存在（static 缓存）
 * 返回 ['table' => bool, 'owner_type_col' => bool]
 */
function dashboardCompanyOwnershipSchema(PDO $pdo): array
{
    static $schema = null;
    if ($schema !== null)
        return $schema;
    try {
        $hasTable = $pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() > 0;
        $hasCol = $hasTable && $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'")->rowCount() > 0;
    } catch (Throwable $e) {
        $hasTable = false;
        $hasCol = false;
    }
    $schema = ['table' => $hasTable, 'owner_type_col' => $hasCol];
    return $schema;
}

/**
 * 多段 Group 链：从筛选的 view_group 反向经 group_ownership (owner_type=group) 再接到
 * company_ownership (owner_type=group)，得到进入当前 view 前的连乘比例 (0~1)。
 * 例：TT 10%→SS × SS 20%→AA = 0.02。无法解析时返回 null（改走原两段式逻辑）。
 */
function dashboardResolveEarningsPathProduct(PDO $pdo, int $companyId, string $viewGroupTrim): ?float
{
    $viewG = strtoupper(trim($viewGroupTrim));
    if ($viewG === '') {
        return null;
    }
    try {
        if ($pdo->query("SHOW TABLES LIKE 'group_ownership'")->rowCount() < 1) {
            return null;
        }
        if ($pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() < 1) {
            return null;
        }
    } catch (Throwable $e) {
        return null;
    }

    $g = $viewG;
    $path = 1.0;
    $maxHops = 32;
    while ($maxHops-- > 0) {
        $stmt = $pdo->prepare("
            SELECT group_id, percentage
            FROM group_ownership
            WHERE owner_type = 'group'
              AND percentage > 0
              AND partner_group_id IS NOT NULL
              AND TRIM(partner_group_id) <> ''
              AND UPPER(TRIM(partner_group_id)) = UPPER(TRIM(?))
            LIMIT 1
        ");
        $stmt->execute([$g]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            break;
        }
        $pct = (float) $row['percentage'];
        if ($pct <= 0) {
            break;
        }
        $path *= ($pct / 100.0);
        $g = strtoupper(trim((string) $row['group_id']));
    }

    $stmtCo = $pdo->prepare("
        SELECT percentage
        FROM company_ownership
        WHERE company_id = ?
          AND owner_type = 'group'
          AND percentage > 0
          AND partner_group_id IS NOT NULL
          AND TRIM(partner_group_id) <> ''
          AND UPPER(TRIM(partner_group_id)) = UPPER(TRIM(?))
        LIMIT 1
    ");
    $stmtCo->execute([$companyId, $g]);
    $coPct = $stmtCo->fetchColumn();
    if ($coPct !== false) {
        $path *= ((float) $coPct) / 100.0;
        return $path;
    }

    $stmtHasGr = $pdo->prepare("SELECT 1 FROM company_ownership WHERE company_id = ? AND owner_type = 'group' LIMIT 1");
    $stmtHasGr->execute([$companyId]);
    if ($stmtHasGr->fetchColumn()) {
        return null;
    }

    $stmtNat = $pdo->prepare("SELECT UPPER(TRIM(group_id)) FROM company WHERE id = ?");
    $stmtNat->execute([$companyId]);
    $nat = $stmtNat->fetchColumn();
    if ($nat && strtoupper(trim((string) $nat)) === $g) {
        return $path;
    }

    return null;
}

function dashboardContraApprovedWhere(PDO $pdo, string $alias = 't'): string
{
    if (!dashboardHasContraApprovalColumns($pdo)) {
        return '';
    }
    $a = $alias !== '' ? $alias . '.' : '';
    return " AND ((
                {$a}transaction_type IN ('CONTRA','PAYMENT','RECEIVE','CLAIM','CLEAR','ADJUSTMENT','WIN','LOSE','PROFIT')
                AND {$a}approval_status = 'APPROVED'
            ) OR {$a}transaction_type NOT IN ('CONTRA','PAYMENT','RECEIVE','CLAIM','CLEAR','ADJUSTMENT','WIN','LOSE','PROFIT'))";
}

/**
 * 是否在仪表板统计中排除 CLEAR：
 * - 对 CAPITAL：不排除（CLEAR 与 CONTRA 行为一致）
 * - 对 EXPENSES/PROFIT：排除 CLEAR（无论是 To 还是 From）
 */
function dashboardShouldExcludeClearForRole(?string $role): bool
{
    if ($role === null) {
        return false;
    }
    $role = strtoupper(trim((string) $role));
    // Dashboard Profit 卡片：PROFIT 角色账户的 CLEAR 不计入（Transaction 页仍正常展示/提交）
    return $role === 'PROFIT';
}

/**
 * 手动 PROFIT（Transaction Payment → WIN/LOSE，非 Bank Process / 赔款）描述条件。
 * 与 search_api.php txn_win_lose bulk 一致。
 */
function dashboardManualProfitDescSql(string $alias = 't'): string
{
    $d = $alias !== '' ? $alias . '.' : '';
    return "(({$d}description NOT LIKE 'Process: %' AND {$d}description NOT LIKE 'Inactive Compensation %' AND {$d}description NOT LIKE 'Compensation %') OR {$d}description IS NULL)";
}

function dashboardMoneyZero(): string
{
    return '0.00000000';
}

function dashboardMoneyAdd($a, $b, int $scale = MONEY_SCALE): string
{
    return money_add($a ?? '0', $b ?? '0', $scale);
}

function dashboardMoneySub($a, $b, int $scale = MONEY_SCALE): string
{
    return money_sub($a ?? '0', $b ?? '0', $scale);
}

function dashboardAddDailyAmount(array &$daily, string $date, $amount): void
{
    if ($date === '') {
        return;
    }
    $daily[$date] = dashboardMoneyAdd($daily[$date] ?? '0', $amount);
}

function dashboardSumDailyAmounts(array $daily): string
{
    $total = dashboardMoneyZero();
    foreach ($daily as $amount) {
        $total = dashboardMoneyAdd($total, $amount);
    }
    return $total;
}

function dashboardOut($value): string
{
    return money_out($value ?? '0');
}

function dashboardOutMap(array $daily): array
{
    foreach ($daily as $date => $amount) {
        $daily[$date] = dashboardOut($amount);
    }
    return $daily;
}

function dashboardEnsureGroupRowForCode(PDO $pdo, string $groupCode): void
{
    $g = strtoupper(trim($groupCode));
    if ($g === '') {
        return;
    }
    try {
        $stmt = $pdo->prepare("
            INSERT INTO `groups` (`group_code`, `group_name`, `owner_id`)
            SELECT DISTINCT
                UPPER(TRIM(c.group_id)),
                UPPER(TRIM(c.group_id)),
                c.owner_id
            FROM company c
            WHERE UPPER(TRIM(c.group_id)) = ?
              AND TRIM(COALESCE(c.group_id, '')) <> ''
            LIMIT 1
            ON DUPLICATE KEY UPDATE
                `owner_id` = COALESCE(`groups`.`owner_id`, VALUES(`owner_id`))
        ");
        $stmt->execute([$g]);
    } catch (Throwable $e) {
        error_log('dashboardEnsureGroupRowForCode(' . $g . '): ' . $e->getMessage());
    }
}

function dashboardResolveGroupScopeIdByCode(PDO $pdo, string $groupCode): int
{
    $g = strtoupper(trim($groupCode));
    if ($g === '') {
        return 0;
    }
    $lookup = static function (PDO $pdo, string $code): int {
        $stmt = $pdo->prepare('SELECT id FROM `groups` WHERE group_code = ? LIMIT 1');
        $stmt->execute([$code]);
        $id = (int) ($stmt->fetchColumn() ?: 0);
        if ($id > 0) {
            return $id;
        }

        $stmt = $pdo->prepare(
            'SELECT id FROM `groups` WHERE UPPER(TRIM(group_code)) = UPPER(TRIM(?)) LIMIT 1'
        );
        $stmt->execute([$code]);

        return (int) ($stmt->fetchColumn() ?: 0);
    };
    try {
        $id = $lookup($pdo, $g);
        if ($id > 0) {
            return $id;
        }
        dashboardEnsureGroupRowForCode($pdo, $g);
        $id = $lookup($pdo, $g);
        if ($id > 0) {
            return $id;
        }

        $mapStmt = $pdo->prepare('
            SELECT g.id
            FROM `groups` g
            INNER JOIN group_company_map m ON m.group_id = g.id
            INNER JOIN company c ON c.id = m.company_id
            WHERE UPPER(TRIM(c.group_id)) = ?
            LIMIT 1
        ');
        $mapStmt->execute([$g]);

        return (int) ($mapStmt->fetchColumn() ?: 0);
    } catch (Throwable $e) {
        error_log('dashboardResolveGroupScopeIdByCode(' . $g . '): ' . $e->getMessage());

        return 0;
    }
}

function dashboardResolveGroupScopeId(PDO $pdo, ?string $viewGroup = null): int
{
    $fromParam = $viewGroup !== null ? strtoupper(trim($viewGroup)) : '';
    if ($fromParam !== '') {
        return dashboardResolveGroupScopeIdByCode($pdo, $fromParam);
    }
    if (!gc_is_group_login()) {
        return 0;
    }
    $identifier = gc_session_login_identifier();
    if ($identifier === null || $identifier === '') {
        return 0;
    }
    return dashboardResolveGroupScopeIdByCode($pdo, $identifier);
}

function dashboardResolveGroupCodeFromScopeId(PDO $pdo, int $groupScopeId): string
{
    if ($groupScopeId <= 0) {
        return '';
    }
    try {
        $stmt = $pdo->prepare('SELECT UPPER(TRIM(group_code)) FROM `groups` WHERE id = ? LIMIT 1');
        $stmt->execute([$groupScopeId]);
        return strtoupper(trim((string) ($stmt->fetchColumn() ?: '')));
    } catch (Throwable $e) {
        return '';
    }
}

function dashboardAssertGroupLedgerAccess(PDO $pdo, string $groupCode, int $groupScopeId): void
{
    $entityId = tx_resolve_group_entity_company_id($pdo, $groupCode);
    if ($entityId <= 0) {
        throw new Exception('无效的集团');
    }
    assertGroupEntityAccess($pdo, $groupCode, $entityId);
}

function dashboardBuildGroupScopedSummary(
    PDO $pdo,
    string $dateFrom,
    string $dateTo,
    int $groupScopeId,
    ?string $filterCurrencyCode = null
): array {
    $roles = ['CAPITAL', 'EXPENSES', 'PROFIT'];
    $result = [];
    $hasTransactionCurrency = dashboardHasTransactionCurrency($pdo);
    $groupCode = dashboardResolveGroupCodeFromScopeId($pdo, $groupScopeId);
    $entityCompanyId = $groupCode !== '' ? tx_resolve_group_entity_company_id($pdo, $groupCode) : 0;
    $currencyMap = [];
    if ($entityCompanyId > 0) {
        $currencyStmt = $pdo->prepare('SELECT id, UPPER(code) AS code FROM currency WHERE company_id = ?');
        $currencyStmt->execute([$entityCompanyId]);
        foreach ($currencyStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $currencyMap[$row['id']] = strtoupper($row['code']);
        }
    }
    $currencyFilterSql = '';
    $currencyFilterParams = [];
    if ($filterCurrencyCode !== null && $hasTransactionCurrency) {
        $currId = array_search($filterCurrencyCode, $currencyMap, true);
        if ($currId === false) {
            foreach ($roles as $role) {
                $result[strtolower($role)] = [
                    'role' => $role,
                    'total_balance' => dashboardMoneyZero(),
                    'initial_balance' => dashboardMoneyZero(),
                    'period_total' => dashboardMoneyZero(),
                    'daily_data' => [],
                ];
            }
            return $result;
        }
        $currencyFilterSql = ' AND t.currency_id = ?';
        $currencyFilterParams = [(int) $currId];
    }
    $contraApproval = dashboardContraApprovedWhere($pdo, 't');

    foreach ($roles as $role) {
        $excludeClear = dashboardShouldExcludeClearForRole($role);
        $clearFilter = $excludeClear ? " AND t.transaction_type <> 'CLEAR'" : '';
        list($roleFilterSql, $roleFilterParams) = dashboardRoleFilterSql($role, 'a');
        $accStmt = $pdo->prepare("
            SELECT DISTINCT a.id
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.scope_type = 'group'
              AND ac.scope_id = ?
              AND {$roleFilterSql}
        ");
        $accStmt->execute(array_merge([$groupScopeId], $roleFilterParams));
        $accountIds = array_map('intval', $accStmt->fetchAll(PDO::FETCH_COLUMN));

        if (empty($accountIds)) {
            $result[strtolower($role)] = [
                'role' => $role,
                'total_balance' => dashboardMoneyZero(),
                'initial_balance' => dashboardMoneyZero(),
                'period_total' => dashboardMoneyZero(),
                'daily_data' => []
            ];
            continue;
        }

        $in = implode(',', array_fill(0, count($accountIds), '?'));

        $bfToSql = "
            SELECT COALESCE(SUM(CASE
                WHEN t.transaction_type IN ('RECEIVE', 'CLAIM') THEN -t.amount
                WHEN t.transaction_type IN ('CONTRA', 'CLEAR') THEN -t.amount
                WHEN t.transaction_type = 'PAYMENT' THEN -t.amount
                WHEN t.transaction_type = 'WIN' THEN -t.amount
                WHEN t.transaction_type = 'LOSE' THEN t.amount
                WHEN t.transaction_type = 'ADJUSTMENT' THEN t.amount
                ELSE 0
            END), 0)
            FROM transactions t
            WHERE t.scope_type = 'group'
              AND t.scope_id = ?
              AND t.account_id IN ($in)
              AND t.transaction_date < ?" . $currencyFilterSql . $clearFilter . $contraApproval;
        $bfToStmt = $pdo->prepare($bfToSql);
        $bfToStmt->execute(array_merge([$groupScopeId], $accountIds, [$dateFrom], $currencyFilterParams));
        $bfTo = (string) ($bfToStmt->fetchColumn() ?? '0');

        $bfFromSql = "
            SELECT COALESCE(SUM(CASE
                WHEN t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM', 'CONTRA', 'CLEAR') THEN t.amount
                WHEN t.transaction_type = 'WIN' THEN t.amount
                WHEN t.transaction_type = 'LOSE' THEN -t.amount
                ELSE 0
            END), 0)
            FROM transactions t
            WHERE t.scope_type = 'group'
              AND t.scope_id = ?
              AND t.from_account_id IN ($in)
              AND t.transaction_date < ?" . $currencyFilterSql . $clearFilter . $contraApproval;
        $bfFromStmt = $pdo->prepare($bfFromSql);
        $bfFromStmt->execute(array_merge([$groupScopeId], $accountIds, [$dateFrom], $currencyFilterParams));
        $bfFrom = (string) ($bfFromStmt->fetchColumn() ?? '0');

        $initial = dashboardMoneyAdd($bfTo, $bfFrom);

        $dailySql = "
            SELECT DATE(t.transaction_date) AS d, COALESCE(SUM(CASE
                WHEN t.account_id IN ($in) THEN
                    CASE
                        WHEN t.transaction_type IN ('RECEIVE', 'CLAIM') THEN -t.amount
                        WHEN t.transaction_type IN ('CONTRA', 'CLEAR') THEN -t.amount
                        WHEN t.transaction_type = 'PAYMENT' THEN -t.amount
                        WHEN t.transaction_type = 'WIN' THEN -t.amount
                        WHEN t.transaction_type = 'LOSE' THEN t.amount
                        WHEN t.transaction_type = 'ADJUSTMENT' THEN t.amount
                        ELSE 0
                    END
                WHEN t.from_account_id IN ($in) THEN
                    CASE
                        WHEN t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM', 'CONTRA', 'CLEAR') THEN t.amount
                        WHEN t.transaction_type = 'WIN' THEN t.amount
                        WHEN t.transaction_type = 'LOSE' THEN -t.amount
                        ELSE 0
                    END
                ELSE 0
            END), 0) AS delta
            FROM transactions t
            WHERE t.scope_type = 'group'
              AND t.scope_id = ?
              AND t.transaction_date BETWEEN ? AND ?
              AND (t.account_id IN ($in) OR t.from_account_id IN ($in))" . $currencyFilterSql . $clearFilter . $contraApproval . "
            GROUP BY DATE(t.transaction_date)
            ORDER BY DATE(t.transaction_date)
        ";
        $dailyStmt = $pdo->prepare($dailySql);
        $dailyParams = array_merge($accountIds, $accountIds, [$groupScopeId, $dateFrom, $dateTo], $currencyFilterParams);
        $dailyStmt->execute($dailyParams);
        $dailyData = [];
        while ($r = $dailyStmt->fetch(PDO::FETCH_ASSOC)) {
            $dailyData[(string) $r['d']] = (string) ($r['delta'] ?? '0');
        }

        $period = dashboardSumDailyAmounts($dailyData);
        $total = dashboardMoneyAdd($initial, $period);

        $result[strtolower($role)] = [
            'role' => $role,
            'total_balance' => dashboardOut($total),
            'initial_balance' => dashboardOut($initial),
            'period_total' => dashboardOut($period),
            'daily_data' => dashboardOutMap($dailyData)
        ];
    }

    return $result;
}

/**
 * Dashboard 交易币别过滤（与 search_api 对齐）：
 * - 优先使用 transactions.currency_id
 * - 若 currency_id 为空，则用 data_capture_details 的 account + currency 映射兜底
 */
function dashboardTxnCurrencyFilter(string $accountColumn): string
{
    if ($accountColumn !== 'account_id' && $accountColumn !== 'from_account_id') {
        $accountColumn = 'account_id';
    }
    return " AND (
        t.currency_id = ?
        OR (
            t.currency_id IS NULL
            AND EXISTS (
                SELECT 1
                FROM data_capture_details dcd
                JOIN data_captures dc ON dcd.capture_id = dc.id
                WHERE dcd.company_id = ? AND dc.company_id = ?
                  AND CAST(dcd.account_id AS CHAR) = CAST(t.`{$accountColumn}` AS CHAR)
                  AND dcd.currency_id = ?
            )
        )
    )";
}

/** @return array<int, string> */
function dashboardLoadCurrencyMap(PDO $pdo, int $companyId): array
{
    $currency_map = [];
    $currency_stmt = $pdo->prepare('SELECT id, UPPER(code) AS code FROM currency WHERE company_id = ?');
    $currency_stmt->execute([$companyId]);
    foreach ($currency_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $currency_map[$row['id']] = strtoupper($row['code']);
    }
    return $currency_map;
}

/**
 * Under a group tab, EXPENSES accounts often sit on the group-entity company (e.g. IG)
 * while PROFIT / data capture stays on the subsidiary (e.g. 95).
 *
 * @return int[]
 */
function dashboardResolveRoleScopeCompanyIds(PDO $pdo, int $companyId, string $role, ?string $viewGroup): array
{
    $scopes = [$companyId];
    if ($role !== 'EXPENSES') {
        return $scopes;
    }

    $groupCodes = [];
    $fromParam = reportNormalizeGroupId($viewGroup ?? '');
    if ($fromParam !== '') {
        $groupCodes[$fromParam] = true;
    }

    $nativeStmt = $pdo->prepare('SELECT UPPER(TRIM(COALESCE(group_id, ""))) FROM company WHERE id = ? LIMIT 1');
    $nativeStmt->execute([$companyId]);
    $nativeGroup = reportNormalizeGroupId($nativeStmt->fetchColumn() ?: '');
    if ($nativeGroup !== '') {
        $groupCodes[$nativeGroup] = true;
    }

    foreach (array_keys($groupCodes) as $groupCode) {
        $entityId = tx_resolve_group_entity_company_id($pdo, $groupCode);
        if ($entityId > 0 && $entityId !== $companyId) {
            $scopes[] = $entityId;
        }
    }

    return array_values(array_unique($scopes));
}

function dashboardEmptyRoleBucket(string $role): array
{
    return [
        'role' => $role,
        'total_balance' => dashboardMoneyZero(),
        'initial_balance' => dashboardMoneyZero(),
        'period_total' => dashboardMoneyZero(),
        'daily_data' => [],
    ];
}

/**
 * Role filter aligned with legacy dashboard + Transaction List (EXPENSES / EXPENSE).
 *
 * @return array{0: string, 1: array<int, string>}
 */
function dashboardRoleFilterSql(string $role, string $alias = 'a'): array
{
    $col = ($alias !== '' ? $alias . '.' : '') . 'role';
    $roleUp = strtoupper(trim($role));
    if ($roleUp === 'EXPENSES') {
        return [
            "UPPER(TRIM(COALESCE({$col}, ''))) IN ('EXPENSES', 'EXPENSE')",
            [],
        ];
    }

    return [
        "UPPER(TRIM(COALESCE({$col}, ''))) = ?",
        [$roleUp],
    ];
}

/**
 * Filter capture rows by currency code (avoids mixing currency_id across companies).
 *
 * @return array{0: string, 1: array<int, string>}
 */
function dashboardCaptureCurrencyFilterSql(?string $filterCurrencyCode, string $dcdAlias = 'dcd'): array
{
    if ($filterCurrencyCode === null || trim($filterCurrencyCode) === '') {
        return ['', []];
    }
    $code = strtoupper(trim($filterCurrencyCode));

    return [
        " AND EXISTS (
            SELECT 1 FROM currency cur
            WHERE cur.id = {$dcdAlias}.currency_id
              AND UPPER(TRIM(cur.code)) = ?
        )",
        [$code],
    ];
}

/**
 * Filter transactions by currency code (aligned with search_api).
 *
 * @return array{0: string, 1: array<int, string>}
 */
function dashboardTransactionCurrencyFilterSql(?string $filterCurrencyCode, string $accountColumn = 'account_id'): array
{
    if ($filterCurrencyCode === null || trim($filterCurrencyCode) === '') {
        return ['', []];
    }
    $code = strtoupper(trim($filterCurrencyCode));
    if ($accountColumn !== 'from_account_id') {
        $accountColumn = 'account_id';
    }

    return [
        " AND (
            EXISTS (
                SELECT 1 FROM currency cur
                WHERE cur.id = t.currency_id
                  AND UPPER(TRIM(cur.code)) = ?
            )
            OR (
                t.currency_id IS NULL
                AND EXISTS (
                    SELECT 1
                    FROM data_capture_details dcd
                    JOIN data_captures dc ON dcd.capture_id = dc.id
                    JOIN currency cur ON cur.id = dcd.currency_id
                    WHERE dcd.company_id = t.company_id
                      AND dc.company_id = t.company_id
                      AND CAST(dcd.account_id AS CHAR) = CAST(t.`{$accountColumn}` AS CHAR)
                      AND UPPER(TRIM(cur.code)) = ?
                )
            )
        )",
        [$code, $code],
    ];
}

/**
 * @return array{0: string, 1: array<int, string>}
 */
function dashboardEntryCurrencyFilterSql(?string $filterCurrencyCode): array
{
    if ($filterCurrencyCode === null || trim($filterCurrencyCode) === '') {
        return ['', []];
    }
    $code = strtoupper(trim($filterCurrencyCode));

    return [
        " AND EXISTS (
            SELECT 1 FROM currency cur
            WHERE cur.id = e.currency_id
              AND UPPER(TRIM(cur.code)) = ?
        )",
        [$code],
    ];
}

/**
 * Discover EXPENSES pool accounts (aligned with Transaction List category=EXPENSES).
 * Accounts may live on group-entity company while transactions post on subsidiary ledger.
 *
 * @return array<int, array<string, mixed>>
 */
function dashboardDiscoverExpenseAccounts(
    PDO $pdo,
    int $scopeCompanyId,
    int $ledgerCompanyId,
    ?string $dateToDb = null
): array {
    $byId = [];

    $sql = "SELECT DISTINCT a.id, a.account_id, a.name, a.role
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE ac.company_id = ?
              AND (
                UPPER(TRIM(COALESCE(a.role, ''))) IN ('EXPENSES', 'EXPENSE')
                OR UPPER(TRIM(COALESCE(a.role, ''))) LIKE 'EXPENSE%'
                OR UPPER(TRIM(COALESCE(a.account_id, ''))) LIKE '%EXPENSE%'
                OR UPPER(TRIM(COALESCE(a.name, ''))) LIKE '%EXPENSE%'
              )
            ORDER BY a.account_id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$scopeCompanyId]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $byId[(int) $row['id']] = $row;
    }

    // search_api: from_account on subsidiary ledger may reference pool accounts not in account_company here.
    $dateCap = $dateToDb !== null && trim($dateToDb) !== '' ? trim($dateToDb) : date('Y-m-d');
    $contra = dashboardContraApprovedWhere($pdo, 't');
    $txnSql = "SELECT DISTINCT a.id, a.account_id, a.name, a.role
               FROM account a
               WHERE UPPER(TRIM(COALESCE(a.role, ''))) IN ('EXPENSES', 'EXPENSE')
                 AND a.id IN (
                   SELECT DISTINCT t.from_account_id
                   FROM transactions t
                   WHERE t.company_id = ?
                     AND t.from_account_id IS NOT NULL
                     AND t.transaction_date <= ?
                     AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                     $contra
                   UNION
                   SELECT DISTINCT t.account_id
                   FROM transactions t
                   WHERE t.company_id = ?
                     AND t.transaction_date <= ?
                     AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                     $contra
                 )
               ORDER BY a.account_id";
    $txnStmt = $pdo->prepare($txnSql);
    $txnStmt->execute([$ledgerCompanyId, $dateCap, $ledgerCompanyId, $dateCap]);
    foreach ($txnStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $byId[(int) $row['id']] = $row;
    }

    if (!empty($byId)) {
        return array_values($byId);
    }

    // Last resort: accounts with capture activity on the ledger company.
    $sql = "SELECT DISTINCT a.id, a.account_id, a.name, a.role
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            INNER JOIN data_capture_details dcd ON dcd.account_id = a.id AND dcd.company_id = ?
            INNER JOIN data_captures dc ON dc.id = dcd.capture_id AND dc.company_id = ?
            WHERE ac.company_id = ?
            ORDER BY a.account_id
            LIMIT 50";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$ledgerCompanyId, $ledgerCompanyId, $scopeCompanyId]);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/** EXPENSES pool: accounts on group entity, transactions on subsidiary (same as Transaction List). */
function dashboardLedgerCompanyIdForRole(string $role, int $primaryCompanyId, int $scopeCompanyId): int
{
    return $role === 'EXPENSES' ? $primaryCompanyId : $scopeCompanyId;
}

function dashboardRoleUsesProfitTransactionRules(string $role): bool
{
    return strtoupper(trim($role)) === 'PROFIT';
}

/** EXPENSES uses the same WIN/LOSE / ADJUSTMENT / RATE txn types as Transaction List (not PROFIT-only domain rules). */
function dashboardRoleUsesFullTransactionTypes(string $role): bool
{
    $roleUp = strtoupper(trim($role));

    return $roleUp === 'PROFIT' || $roleUp === 'EXPENSES';
}

/**
 * EXPENSES pool accounts may capture on group entity while transactions post on subsidiary ledger.
 *
 * @param int[] $scopeCompanyIds
 * @return int[]
 */
function dashboardCaptureCompanyIdsForRole(string $role, int $ledgerCompanyId, array $scopeCompanyIds): array
{
    if (strtoupper(trim($role)) !== 'EXPENSES') {
        return [$ledgerCompanyId];
    }

    return array_values(array_unique(array_merge([$ledgerCompanyId], $scopeCompanyIds)));
}

function dashboardNormalizeSearchRange(string $dateFrom, string $dateTo): array
{
    $from = trim($dateFrom);
    $to = trim($dateTo);
    if (strlen($from) <= 10) {
        $from .= ' 00:00:00';
    }
    if (strlen($to) <= 10) {
        $to .= ' 23:59:59';
    }

    return [$from, $to];
}

function dashboard_api_main(): void
{
    global $pdo;
    if (!$pdo instanceof PDO) {
        throw new Exception('Database connection failed');
    }

try {
    // 检查用户是否登录
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }

    // 获取搜索参数
    $date_from = $_GET['date_from'] ?? null;
    $date_to = $_GET['date_to'] ?? null;

    // 获取 company_id：优先使用参数，否则使用 session
    $company_id = null;
    $requestedCompanyId = isset($_GET['company_id']) && $_GET['company_id'] !== ''
        ? (int) $_GET['company_id']
        : 0;

    $viewGroupForAccess = isset($_GET['view_group']) ? trim((string) $_GET['view_group']) : null;

    if ($requestedCompanyId > 0) {
        if (gc_is_group_login()) {
            if (!gc_session_can_access_company_id($pdo, $requestedCompanyId, $viewGroupForAccess)) {
                throw new Exception('无权访问该公司');
            }
            $company_id = $requestedCompanyId;
        } else {
            $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
            if ($userRole === 'owner') {
                $owner_id = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
                $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
                $stmt->execute([$requestedCompanyId, $owner_id]);
                if ($stmt->fetchColumn()) {
                    $company_id = $requestedCompanyId;
                } else {
                    throw new Exception('无权访问该公司');
                }
            } else {
                if (isset($_SESSION['company_id']) && (int) $_SESSION['company_id'] === $requestedCompanyId) {
                    $company_id = $requestedCompanyId;
                } else {
                    $ucm_stmt = $pdo->prepare("SELECT 1 FROM user_company_map WHERE user_id = ? AND company_id = ? LIMIT 1");
                    $ucm_stmt->execute([$_SESSION['user_id'], $requestedCompanyId]);
                    if ($ucm_stmt->fetchColumn()) {
                        $company_id = $requestedCompanyId;
                    } else {
                        throw new Exception('无权访问该公司');
                    }
                }
            }
        }
    } else {
        // Group-only request (no company_id): handled below. Do not fall back to session company.
        $groupOnlyParam = reportNormalizeGroupId($_GET['group_id'] ?? '');
        $viewGroupOnlyParam = reportNormalizeGroupId($_GET['view_group'] ?? '');
        $hasGroupOnlyRequest = $groupOnlyParam !== '' || $viewGroupOnlyParam !== '';
        if (!gc_is_group_login() && !$hasGroupOnlyRequest) {
            if (!isset($_SESSION['company_id'])) {
                throw new Exception('用户未登录或缺少公司信息');
            }
            $company_id = (int) $_SESSION['company_id'];
        }
    }

    // 如果没有提供日期范围，默认使用当月
    if (!$date_from || !$date_to) {
        $currentYear = date('Y');
        $currentMonth = date('m');
        $date_from = "$currentYear-$currentMonth-01";
        $date_to = date('Y-m-t'); // 当月最后一天
    }

    list($date_from_db, $date_to_db) = dashboardNormalizeSearchRange($date_from, $date_to);

    // 可选：按币别筛选（传 currency 为 code，如 MYR、USD）
    $filter_currency_code = null;
    if (isset($_GET['currency']) && trim((string) $_GET['currency']) !== '') {
        $filter_currency_code = strtoupper(trim((string) $_GET['currency']));
    }

    // No company_id: group ledger only (scope_type=group). Distinct from company_id-scoped rows.
    $groupLedgerCode = reportNormalizeGroupId($_GET['view_group'] ?? '');
    if ($groupLedgerCode === '') {
        $groupLedgerCode = reportNormalizeGroupId($_GET['group_id'] ?? '');
    }
    if ($groupLedgerCode === '' && gc_is_group_login()) {
        $groupLedgerCode = (string) (gc_session_login_identifier() ?? '');
    }
    $useGroupLedger = $requestedCompanyId <= 0 && $groupLedgerCode !== '';
    $groupScopeId = 0;

    if ($useGroupLedger) {
        // Prefer group-entity company row (company_id = AP) — works even when groups.id lookup fails.
        $groupEntityCompanyId = tx_resolve_group_entity_company_id($pdo, $groupLedgerCode);
        if ($groupEntityCompanyId > 0) {
            assertGroupEntityAccess($pdo, $groupLedgerCode, $groupEntityCompanyId);
            $company_id = $groupEntityCompanyId;
            $useGroupLedger = false;
        } else {
            $groupScopeId = dashboardResolveGroupScopeId($pdo, $groupLedgerCode);
            if ($groupScopeId <= 0) {
                $dbName = '';
                try {
                    $dbName = (string) ($pdo->query('SELECT DATABASE()')->fetchColumn() ?: '');
                } catch (Throwable $ignored) {
                    $dbName = '';
                }
                throw new Exception(
                    'Group scope is invalid or not initialized (group_code='
                    . $groupLedgerCode
                    . ($dbName !== '' ? ', database=' . $dbName : '')
                    . '). Confirm migration 20260528_dual_tenant_company_group.sql on this database.'
                );
            }
            dashboardAssertGroupLedgerAccess($pdo, $groupLedgerCode, $groupScopeId);
        }
    }

    // Pure group ledger (no group-entity company row such as company_id=AP).
    if ($useGroupLedger) {
        $groupResult = dashboardBuildGroupScopedSummary(
            $pdo,
            $date_from_db,
            $date_to_db,
            $groupScopeId,
            $filter_currency_code
        );
        echo json_encode([
            'success' => true,
            'data' => [
                'capital' => $groupResult['capital']['total_balance'],
                'expenses' => $groupResult['expenses']['total_balance'],
                'profit' => $groupResult['profit']['total_balance'],
                'ownership_percentage' => 0,
                'has_ownership_setup' => false,
                'group_equity_percentage' => 0,
                'group_account_percentage' => 0,
                'has_group_ownership' => false,
                'period_total' => [
                    'capital' => $groupResult['capital']['period_total'],
                    'expenses' => $groupResult['expenses']['period_total'],
                    'profit' => $groupResult['profit']['period_total']
                ],
                'initial_balance' => [
                    'capital' => $groupResult['capital']['initial_balance'],
                    'expenses' => $groupResult['expenses']['initial_balance'],
                    'profit' => $groupResult['profit']['initial_balance']
                ],
                'daily_data' => [
                    'capital' => $groupResult['capital']['daily_data'],
                    'expenses' => $groupResult['expenses']['daily_data'],
                    'profit' => $groupResult['profit']['daily_data'],
                    'profit_payment_flow_daily' => []
                ],
                'date_range' => [
                    'from' => $date_from,
                    'to' => $date_to
                ]
            ]
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    // Explicit company_id: standard company dashboard (company_id rows).

    // 使用 static 缓存函数，整个请求中只查一次 schema
    $hasTransactionCurrency = dashboardHasTransactionCurrency($pdo);

    // 公司 currency 映射只查一次，供多角色复用
    $currency_map = [];
    $currency_stmt = $pdo->prepare("SELECT id, UPPER(code) AS code FROM currency WHERE company_id = ?");
    $currency_stmt->execute([$company_id]);
    foreach ($currency_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $currency_map[$row['id']] = strtoupper($row['code']);
    }

    // 定义要查询的角色
    $roles = ['CAPITAL', 'EXPENSES', 'PROFIT'];
    $result = [];

    $viewGroupCodeForScope = reportNormalizeGroupId($_GET['view_group'] ?? '');
    if ($viewGroupCodeForScope === '' && $company_id > 0) {
        $vgStmt = $pdo->prepare('SELECT UPPER(TRIM(COALESCE(group_id, ""))) FROM company WHERE id = ? LIMIT 1');
        $vgStmt->execute([$company_id]);
        $viewGroupCodeForScope = reportNormalizeGroupId($vgStmt->fetchColumn() ?: '');
    }

    foreach ($roles as $role) {
        $excludeClear = dashboardShouldExcludeClearForRole($role);
        $scopeCompanyIds = dashboardResolveRoleScopeCompanyIds($pdo, $company_id, $role, $viewGroupCodeForScope);

        $total_balance = dashboardMoneyZero();
        $total_bf = dashboardMoneyZero();
        $daily_data = [];
        $primaryAccountIds = [];
        $hadAccounts = false;
        $seenExpenseAccountIds = [];

        foreach ($scopeCompanyIds as $scopeCompanyId) {
            list($roleFilterSql, $roleFilterParams) = dashboardRoleFilterSql($role, 'a');

            if ($role === 'EXPENSES') {
                $accounts = dashboardDiscoverExpenseAccounts($pdo, $scopeCompanyId, $company_id, $date_to_db);
            } else {
                // 获取该角色的所有账户
                // 与 Transaction List 一致：含 inactive 账户（期内仍可能有 WIN/LOSE / PAYMENT）
                $sql = "SELECT DISTINCT a.id, a.account_id, a.name, a.role
                        FROM account a
                        INNER JOIN account_company ac ON a.id = ac.account_id
                        WHERE ac.company_id = ?
                          AND {$roleFilterSql}";

                $params = [];
                list($sql, $params) = filterAccountsByPermissions($pdo, $sql, [], $scopeCompanyId);
                $sql = preg_replace('/\bAND id IN\b/i', 'AND a.id IN', $sql);
                $sql = preg_replace('/\bWHERE id IN\b/i', 'WHERE a.id IN', $sql);

                $params = array_merge([$scopeCompanyId], $roleFilterParams, $params);
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            // EXPENSES 池账户：Dashboard 不按 account_permissions 白名单过滤

            $account_ids = array_values(array_unique(array_map('intval', array_column($accounts, 'id'))));
            if ($role === 'EXPENSES') {
                $account_ids = array_values(array_filter(
                    $account_ids,
                    static function (int $id) use (&$seenExpenseAccountIds): bool {
                        if ($id <= 0 || isset($seenExpenseAccountIds[$id])) {
                            return false;
                        }
                        $seenExpenseAccountIds[$id] = true;

                        return true;
                    }
                ));
            }
            if (empty($account_ids)) {
                continue;
            }
            $hadAccounts = true;
            if ($scopeCompanyId === $company_id) {
                $primaryAccountIds = $account_ids;
            }

            // EXPENSES: pool accounts on group entity, ledger/transactions on subsidiary (see search_api).
            $ledgerCompanyId = dashboardLedgerCompanyIdForRole($role, $company_id, $scopeCompanyId);
            $captureCompanyIds = dashboardCaptureCompanyIdsForRole($role, $ledgerCompanyId, $scopeCompanyIds);
            $capture_company_placeholder = implode(',', array_fill(0, count($captureCompanyIds), '?'));
            $useProfitTxnRules = dashboardRoleUsesProfitTransactionRules($role);
            $useFullTxnTypes = dashboardRoleUsesFullTransactionTypes($role);

            $ids_placeholder = implode(',', array_fill(0, count($account_ids), '?'));
            list($currency_filter_dcd, $currency_params_dcd) = dashboardCaptureCurrencyFilterSql($filter_currency_code);
            list($currency_filter_t_to, $currency_params_t_to) = dashboardTransactionCurrencyFilterSql(
                $filter_currency_code,
                'account_id'
            );
            list($currency_filter_t_from, $currency_params_t_from) = dashboardTransactionCurrencyFilterSql(
                $filter_currency_code,
                'from_account_id'
            );
            list($currency_filter_e, $currency_params_e) = dashboardEntryCurrencyFilterSql($filter_currency_code);

            // --- 1. 计算 B/F (Balance Forward) ---
            // A. Data Capture B/F
            $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0)
                    FROM data_capture_details dcd
                    JOIN data_captures dc ON dcd.capture_id = dc.id
                    WHERE dc.company_id IN ($capture_company_placeholder)
                      AND dcd.company_id IN ($capture_company_placeholder)
                      AND dcd.account_id IN ($ids_placeholder)
                      AND dc.capture_date < ?" . $currency_filter_dcd;
            $bf_stmt = $pdo->prepare($sql);
            $bf_stmt->execute(array_merge(
                $captureCompanyIds,
                $captureCompanyIds,
                $account_ids,
                [$date_from_db],
                $currency_params_dcd
            ));
            $total_bf = dashboardMoneyAdd($total_bf, $bf_stmt->fetchColumn());

        // B. Transactions B/F (To/From)
        if ($hasTransactionCurrency) {
            $clearFilter = $excludeClear ? " AND t.transaction_type <> 'CLEAR'" : "";
            $contraApproval = dashboardContraApprovedWhere($pdo, 't');
            $fromDomainFilter = $useProfitTxnRules ? '' : "
                      AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_SHARE_COMMISSION|%'
                      AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_NET_PROFIT|%'";
            $bfTxnTypes = $useFullTxnTypes
                ? "('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'RATE', 'WIN', 'LOSE', 'ADJUSTMENT')"
                : "('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')";
            $dailyTxnTypes = $useFullTxnTypes
                ? "('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'RATE', 'WIN', 'LOSE', 'ADJUSTMENT')"
                : "('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')";
            $dailyFromTxnTypes = $useFullTxnTypes
                ? "('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'RATE', 'WIN', 'LOSE')"
                : "('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')";

            // To Account
            $sql = "SELECT COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -amount
                        WHEN transaction_type = 'CONTRA' THEN -amount
                        WHEN transaction_type = 'CLEAR' THEN -amount
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN amount
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN amount
                        WHEN transaction_type = 'PAYMENT' THEN -amount
                        WHEN transaction_type = 'WIN' AND (description LIKE 'Process: %') THEN amount
                        WHEN transaction_type = 'LOSE' AND (description LIKE 'Process: %') THEN -amount
                        WHEN transaction_type = 'WIN' AND " . dashboardManualProfitDescSql('t') . " THEN -amount
                        WHEN transaction_type = 'LOSE' AND " . dashboardManualProfitDescSql('t') . " THEN amount
                        WHEN transaction_type = 'ADJUSTMENT' THEN amount
                        ELSE 0
                    END), 0)
                    FROM transactions t
                    WHERE t.company_id = ?
                      AND t.account_id IN ($ids_placeholder)
                      AND t.transaction_date < ?
                      AND t.transaction_type IN $bfTxnTypes" . $currency_filter_t_to . $clearFilter . $contraApproval;
            $bf_stmt = $pdo->prepare($sql);
            $bf_stmt->execute(array_merge([$ledgerCompanyId], $account_ids, [$date_from_db], $currency_params_t_to));
            $total_bf = dashboardMoneyAdd($total_bf, $bf_stmt->fetchColumn());

            // From Account（含手动 PROFIT WIN/LOSE，与 search_api from 侧一致）
            $sql = "SELECT COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM', 'CLEAR') THEN amount
                        WHEN transaction_type = 'CONTRA' THEN amount
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN -amount
                        WHEN transaction_type = 'WIN' AND " . dashboardManualProfitDescSql('t') . " THEN amount
                        WHEN transaction_type = 'LOSE' AND " . dashboardManualProfitDescSql('t') . " THEN -amount
                        ELSE 0
                    END), 0)
                    FROM transactions t
                    WHERE t.company_id = ?
                      AND t.from_account_id IN ($ids_placeholder)
                      AND t.transaction_date < ?
                      AND t.transaction_type IN $bfTxnTypes" . $currency_filter_t_from . $clearFilter . $fromDomainFilter . $contraApproval;
            $bf_stmt = $pdo->prepare($sql);
            $bf_stmt->execute(array_merge([$ledgerCompanyId], $account_ids, [$date_from_db], $currency_params_t_from));
            $total_bf = dashboardMoneyAdd($total_bf, $bf_stmt->fetchColumn());

            // RATE B/F from transaction_entry
            try {
                if (dashboardHasTransactionEntry($pdo)) { // static 缓存，不重复 SHOW
                    $sql = "SELECT COALESCE(SUM(CASE
                                WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
                                WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -e.amount
                                WHEN e.entry_type = 'RATE_MIDDLEMAN' THEN e.amount
                                ELSE e.amount
                            END), 0)
                            FROM transaction_entry e
                            JOIN transactions h ON e.header_id = h.id
                            WHERE h.company_id = ?
                              AND e.company_id = ?
                              AND e.account_id IN ($ids_placeholder)
                              AND h.transaction_date < ?" . $currency_filter_e;
                    $bf_stmt = $pdo->prepare($sql);
                    $bf_stmt->execute(array_merge([$ledgerCompanyId, $ledgerCompanyId], $account_ids, [$date_from_db], $currency_params_e));
                    $total_bf = dashboardMoneyAdd($total_bf, $bf_stmt->fetchColumn());
                }
            } catch (Throwable $e) {
            }
        }

        // --- 2. 计算每日数据 (Daily Deltas) ---
        $sql = "SELECT DATE(dc.capture_date) as date, 
                       COALESCE(SUM(dcd.processed_amount), 0) as win_loss
                FROM data_capture_details dcd
                JOIN data_captures dc ON dcd.capture_id = dc.id
                WHERE dc.company_id IN ($capture_company_placeholder)
                  AND dcd.company_id IN ($capture_company_placeholder)
                  AND dcd.account_id IN ($ids_placeholder)
                  AND dc.capture_date BETWEEN ? AND ?" . $currency_filter_dcd . "
                GROUP BY DATE(dc.capture_date)
                ORDER BY DATE(dc.capture_date)";
        $daily_stmt = $pdo->prepare($sql);
        $daily_stmt->execute(array_merge(
            $captureCompanyIds,
            $captureCompanyIds,
            $account_ids,
            [$date_from_db, $date_to_db],
            $currency_params_dcd
        ));
        foreach ($daily_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            dashboardAddDailyAmount($daily_data, (string) $row['date'], $row['win_loss'] ?? '0');
        }

        // B. Transactions Daily Cr/Dr
        if ($hasTransactionCurrency) {
            $clearFilter = $excludeClear ? " AND t.transaction_type <> 'CLEAR'" : "";
            $contraApproval = dashboardContraApprovedWhere($pdo, 't');

            // To Account
            $sql = "SELECT DATE(t.transaction_date) as date,
                           COALESCE(SUM(CASE 
                               WHEN transaction_type IN ('RECEIVE', 'CLAIM', 'RATE') THEN -t.amount
                               WHEN transaction_type = 'CONTRA' THEN -t.amount
                               WHEN transaction_type = 'CLEAR' THEN -t.amount
                               WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN t.amount
                               WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                               WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN t.amount
                               WHEN transaction_type = 'PAYMENT' THEN -t.amount
                               WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %') THEN t.amount
                               WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %') THEN -t.amount
                               WHEN t.transaction_type = 'WIN' AND " . dashboardManualProfitDescSql('t') . " THEN -t.amount
                               WHEN t.transaction_type = 'LOSE' AND " . dashboardManualProfitDescSql('t') . " THEN t.amount
                               WHEN t.transaction_type = 'ADJUSTMENT' THEN t.amount
                               ELSE 0
                           END), 0) as cr_dr
                    FROM transactions t
                    WHERE t.company_id = ?
                      AND t.account_id IN ($ids_placeholder)
                      AND t.transaction_date BETWEEN ? AND ?
                      AND t.transaction_type IN $dailyTxnTypes"
                . $currency_filter_t_to . $clearFilter . $contraApproval . "
                    GROUP BY DATE(t.transaction_date)
                    ORDER BY DATE(t.transaction_date)";
            $daily_stmt = $pdo->prepare($sql);
            $daily_stmt->execute(array_merge([$ledgerCompanyId], $account_ids, [$date_from_db, $date_to_db], $currency_params_t_to));
            foreach ($daily_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                dashboardAddDailyAmount($daily_data, (string) $row['date'], $row['cr_dr'] ?? '0');
            }

            // From Account（含手动 PROFIT WIN/LOSE）
            $sql = "SELECT DATE(t.transaction_date) as date,
                           COALESCE(SUM(CASE 
                               WHEN transaction_type = 'CONTRA' THEN t.amount
                               WHEN transaction_type = 'CLEAR' THEN t.amount
                               WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN 0
                               WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                               WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN -t.amount
                               WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM', 'RATE') THEN t.amount
                               WHEN t.transaction_type = 'WIN' AND " . dashboardManualProfitDescSql('t') . " THEN t.amount
                               WHEN t.transaction_type = 'LOSE' AND " . dashboardManualProfitDescSql('t') . " THEN -t.amount
                               ELSE 0
                           END), 0) as cr_dr
                    FROM transactions t
                    WHERE t.company_id = ?
                      AND t.from_account_id IN ($ids_placeholder)
                      AND t.transaction_date BETWEEN ? AND ?
                      AND t.transaction_type IN $dailyFromTxnTypes"
                . $currency_filter_t_from . $clearFilter . $fromDomainFilter . $contraApproval . "
                    GROUP BY DATE(t.transaction_date)
                    ORDER BY DATE(t.transaction_date)";
            $daily_stmt = $pdo->prepare($sql);
            $daily_stmt->execute(array_merge([$ledgerCompanyId], $account_ids, [$date_from_db, $date_to_db], $currency_params_t_from));
            foreach ($daily_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                dashboardAddDailyAmount($daily_data, (string) $row['date'], $row['cr_dr'] ?? '0');
            }

            // RATE daily from transaction_entry
            try {
                if (dashboardHasTransactionEntry($pdo)) {
                    $sql = "SELECT DATE(h.transaction_date) as date,
                                   COALESCE(SUM(CASE
                                       WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
                                       WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -e.amount
                                       WHEN e.entry_type = 'RATE_MIDDLEMAN' THEN e.amount
                                       ELSE e.amount
                                   END), 0) as rate_delta
                            FROM transaction_entry e
                            JOIN transactions h ON e.header_id = h.id
                            WHERE h.company_id = ?
                              AND e.company_id = ?
                              AND e.account_id IN ($ids_placeholder)
                              AND h.transaction_date BETWEEN ? AND ?" . $currency_filter_e . "
                            GROUP BY DATE(h.transaction_date)";
                    $daily_stmt = $pdo->prepare($sql);
                    $daily_stmt->execute(array_merge([$ledgerCompanyId, $ledgerCompanyId], $account_ids, [$date_from_db, $date_to_db], $currency_params_e));
                    foreach ($daily_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                        dashboardAddDailyAmount($daily_data, (string) $row['date'], $row['rate_delta'] ?? '0');
                    }
                }
            } catch (Throwable $e) {
            }
        }
        }

        if (!$hadAccounts) {
            $result[strtolower($role)] = dashboardEmptyRoleBucket($role);
            continue;
        }

        // --- 2b. PROFIT 口径对齐 Transaction List：从池账号扣回 Domain Share Commission（毛额 -> 净额） ---
        if ($role === 'PROFIT' && !empty($primaryAccountIds)) {
            $profitIdsPlaceholder = implode(',', array_fill(0, count($primaryAccountIds), '?'));
            list($profitAdjCurrencyFilter, $profitAdjCurrencyParams) = dashboardTransactionCurrencyFilterSql(
                $filter_currency_code,
                'from_account_id'
            );

            // A) 调整期初：起始日前的 Share Commission 需要从 B/F 扣回
            $adjBfSql = "SELECT COALESCE(SUM(t.amount), 0) AS adj_total
                         FROM transactions t
                         WHERE t.company_id = ?
                           AND t.transaction_type = 'PAYMENT'
                           AND t.from_account_id IN ($profitIdsPlaceholder)
                           AND t.transaction_date < ?
                           AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%'" . $profitAdjCurrencyFilter;
            $adjBfStmt = $pdo->prepare($adjBfSql);
            $adjBfStmt->execute(array_merge([$company_id], $primaryAccountIds, [$date_from_db], $profitAdjCurrencyParams));
            $adjBf = $adjBfStmt->fetchColumn();
            if (money_cmp(money_abs($adjBf), '0.00001') > 0) {
                $total_bf = dashboardMoneySub($total_bf, $adjBf);
            }

            // B) 调整本期：按日扣回，保证图表与 period_total 一致
            $adjDailySql = "SELECT DATE(t.transaction_date) AS date, COALESCE(SUM(t.amount), 0) AS adj_total
                            FROM transactions t
                            WHERE t.company_id = ?
                              AND t.transaction_type = 'PAYMENT'
                              AND t.from_account_id IN ($profitIdsPlaceholder)
                              AND t.transaction_date BETWEEN ? AND ?
                              AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%'" . $profitAdjCurrencyFilter . "
                            GROUP BY DATE(t.transaction_date)
                            ORDER BY DATE(t.transaction_date)";
            $adjDailyStmt = $pdo->prepare($adjDailySql);
            $adjDailyStmt->execute(array_merge([$company_id], $primaryAccountIds, [$date_from_db, $date_to_db], $profitAdjCurrencyParams));
            foreach ($adjDailyStmt->fetchAll(PDO::FETCH_ASSOC) as $adjRow) {
                $d = (string) ($adjRow['date'] ?? '');
                if ($d === '') {
                    continue;
                }
                $daily_data[$d] = dashboardMoneySub($daily_data[$d] ?? '0', $adjRow['adj_total'] ?? '0');
            }
        }

        // --- 3. 计算本期总余额 ---
        $total_period_delta = dashboardSumDailyAmounts($daily_data);
        $total_balance = dashboardMoneyAdd($total_bf, $total_period_delta);

        $result[strtolower($role)] = [
            'role' => $role,
            'total_balance' => dashboardOut($total_balance),
            'initial_balance' => dashboardOut($total_bf),
            'period_total' => dashboardOut($total_period_delta),
            'daily_data' => dashboardOutMap($daily_data)
        ];
    }

    // ── RATE_MIDDLEMAN 手续费同步至 Profit ──────────────────────────────────
    // RATE 账户（role='RATE'）的 Win/Loss 来自 RATE_MIDDLEMAN 分录，
    // 不属于 PROFIT role 账户，被上方 roles 循环跳过，导致 Dashboard 显示 0。
    // 此处专门汇总全公司当期所有 RATE_MIDDLEMAN 金额，直接累加到 profit 里，
    // 确保 transaction.php 显示的 Win/Loss 与 Dashboard Profit 卡片一致。
    if (dashboardHasTransactionEntry($pdo)) {
        try {
            $rateMMSql = "
                SELECT
                    DATE(h.transaction_date) AS date,
                    COALESCE(SUM(e.amount), 0) AS total
                FROM transaction_entry e
                JOIN transactions h ON e.header_id = h.id
                WHERE h.company_id = ?
                  AND e.company_id = ?
                  AND e.entry_type = 'RATE_MIDDLEMAN'
                  AND h.transaction_date BETWEEN ? AND ?
            ";
            $rateMMParams = [$company_id, $company_id, $date_from_db, $date_to_db];
            $skipRateMM = false;

            // 按币种过滤（与前端选择的 currency 一致）
            if ($filter_currency_code !== null) {
                $rateCurrId = array_search($filter_currency_code, $currency_map);
                if ($rateCurrId === false) {
                    // 该公司无此币种：勿把其它币种的 RATE_MIDDLEMAN 并入 profit
                    $skipRateMM = true;
                } else {
                    $rateMMSql .= " AND e.currency_id = ?";
                    $rateMMParams[] = $rateCurrId;
                }
            }

            $rateMMDaily = [];
            $rateMMPeriodTotal = dashboardMoneyZero();
            if (!$skipRateMM) {
                $rateMMSql .= " GROUP BY DATE(h.transaction_date)";
                $rateMMStmt = $pdo->prepare($rateMMSql);
                $rateMMStmt->execute($rateMMParams);
                while ($rateRow = $rateMMStmt->fetch(PDO::FETCH_ASSOC)) {
                    $d = $rateRow['date'];
                    $v = $rateRow['total'] ?? '0';
                    dashboardAddDailyAmount($rateMMDaily, (string) $d, $v);
                    $rateMMPeriodTotal = dashboardMoneyAdd($rateMMPeriodTotal, $v);
                }
            }

            // 合并到 profit：period_total、daily_data、total_balance
            if (!empty($rateMMDaily)) {
                foreach ($rateMMDaily as $d => $v) {
                    dashboardAddDailyAmount($result['profit']['daily_data'], (string) $d, $v);
                }
                $result['profit']['period_total'] = dashboardOut(dashboardMoneyAdd($result['profit']['period_total'] ?? '0', $rateMMPeriodTotal));
                $result['profit']['total_balance'] = dashboardOut(dashboardMoneyAdd($result['profit']['total_balance'] ?? '0', $rateMMPeriodTotal));
                $result['profit']['daily_data'] = dashboardOutMap($result['profit']['daily_data']);
            }
        } catch (Throwable $rateMMErr) {
            // RATE_MIDDLEMAN 查询失败不影响主数据（向后兼容）
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    // 严格流水口径：仅 PAYMENT + PROFIT 账户 的日净额（To 为负，From 为正）
    $profit_payment_flow_daily = calculateProfitPaymentDailyFlow(
        $pdo,
        $company_id,
        $date_from_db,
        $date_to_db,
        $filter_currency_code,
        $hasTransactionCurrency,
        dashboardHasContraApprovalColumns($pdo)
    );

    // 获取当前账户的 ownership_percentage
    $ownership_percentage = 0;
    $has_ownership_setup = false;
    $group_equity_percentage = 0;
    $group_account_percentage = 0;
    $has_group_ownership = false;
    try {
        $ownershipSchema = dashboardCompanyOwnershipSchema($pdo); // static 缓存
        $hasCompanyOwnership = $ownershipSchema['table'];
        if ($hasCompanyOwnership) {
            $stmtSetup = $pdo->prepare("SELECT 1 FROM company_ownership WHERE company_id = ? LIMIT 1");
            $stmtSetup->execute([$company_id]);
            if ($stmtSetup->fetchColumn() !== false) {
                $has_ownership_setup = true;
            }

            $hasOwnerType = $ownershipSchema['owner_type_col'];
            $userId = $_SESSION['user_id'] ?? 0;
            $userType = $_SESSION['user_type'] ?? '';

            if ($hasOwnerType) {
                $ownerTypeStr = 'account';
                if ($userType === 'owner') {
                    $ownerTypeStr = 'owner';
                } elseif ($userType === 'user') {
                    $ownerTypeStr = 'user';
                }

                // Direct ownership: JK's own share in this company
                $stmtPct = $pdo->prepare("SELECT percentage FROM company_ownership WHERE company_id = ? AND account_id = ? AND owner_type = ?");
                $stmtPct->execute([$company_id, $userId, $ownerTypeStr]);
                $pct = $stmtPct->fetchColumn();
                if ($pct !== false) {
                    $ownership_percentage = (float) $pct;
                }
            } else {
                if ($userType === 'member') {
                    $stmtPct = $pdo->prepare("SELECT percentage FROM company_ownership WHERE company_id = ? AND account_id = ?");
                    $stmtPct->execute([$company_id, $userId]);
                    $pct = $stmtPct->fetchColumn();
                    if ($pct !== false) {
                        $ownership_percentage = (float) $pct;
                    }
                }
            }

            // ── Group Equity ──
            // 多段链：TT→SS% × SS→AA% (group_ownership) × AA 内用户% ；Earnings = 净利 × 链上连乘
            // 有「直接」公司股权 (ownership_percentage>0) 时仅用直接%，避免与链重复（如 JK 90%）
            // 原两段式：company group 行 × group_ownership
            try {
                $view_group = isset($_GET['view_group']) ? trim((string) $_GET['view_group']) : '';
                $skipGroupChain = ((float) $ownership_percentage) > 0.0;
                $grpEquityRow = null;
                $multiGroupPathResolved = false;

                if (!$skipGroupChain) {
                    if ($view_group !== '') {
                        $pathDec = dashboardResolveEarningsPathProduct($pdo, $company_id, $view_group);
                        if ($pathDec !== null) {
                            $multiGroupPathResolved = true;
                            $group_equity_percentage = $pathDec * 100.0;
                            $hasGroupTable = $pdo->query("SHOW TABLES LIKE 'group_ownership'")->rowCount() > 0;
                            if ($hasGroupTable) {
                                $stmtAccShare = $pdo->prepare("
                                    SELECT percentage FROM group_ownership
                                    WHERE UPPER(TRIM(group_id)) = UPPER(TRIM(?)) AND account_id = ? AND owner_type = ?
                                ");
                                $stmtAccShare->execute([$view_group, $userId, $ownerTypeStr ?? 'owner']);
                                $accSharePct = $stmtAccShare->fetchColumn();
                                if ($accSharePct !== false) {
                                    $group_account_percentage = (float) $accSharePct;
                                    $has_group_ownership = true;
                                } else {
                                    $group_equity_percentage = 0.0;
                                    $group_account_percentage = 0.0;
                                }
                            }
                        }
                    }
                }

                if (!$has_group_ownership && !$multiGroupPathResolved) {
                    if ($view_group !== '') {
                        $stmtGrpEquity = $pdo->prepare("
                            SELECT partner_group_id, percentage
                            FROM company_ownership
                            WHERE company_id = ? AND owner_type = 'group'
                              AND UPPER(TRIM(partner_group_id)) = UPPER(TRIM(?))
                            LIMIT 1
                        ");
                        $stmtGrpEquity->execute([$company_id, $view_group]);
                        $grpEquityRow = $stmtGrpEquity->fetch(PDO::FETCH_ASSOC);
                        if (!$grpEquityRow) {
                            $stmtGrpEquity = $pdo->prepare("
                                SELECT partner_group_id, percentage
                                FROM company_ownership
                                WHERE company_id = ? AND owner_type = 'group'
                                LIMIT 1
                            ");
                            $stmtGrpEquity->execute([$company_id]);
                            $grpEquityRow = $stmtGrpEquity->fetch(PDO::FETCH_ASSOC);
                        }
                    } else {
                        $stmtGrpEquity = $pdo->prepare("
                            SELECT partner_group_id, percentage
                            FROM company_ownership
                            WHERE company_id = ? AND owner_type = 'group'
                            LIMIT 1
                        ");
                        $stmtGrpEquity->execute([$company_id]);
                        $grpEquityRow = $stmtGrpEquity->fetch(PDO::FETCH_ASSOC);
                    }

                    if ($grpEquityRow && $grpEquityRow['partner_group_id']) {
                        $companyGroupId = $grpEquityRow['partner_group_id'];
                        $group_equity_percentage = (float) $grpEquityRow['percentage'];

                        $hasGroupTable = $pdo->query("SHOW TABLES LIKE 'group_ownership'")->rowCount() > 0;
                        if ($hasGroupTable) {
                            $stmtAccShare = $pdo->prepare("
                                SELECT percentage FROM group_ownership
                                WHERE group_id = ? AND account_id = ? AND owner_type = ?
                            ");
                            $stmtAccShare->execute([$companyGroupId, $userId, $ownerTypeStr ?? 'owner']);
                            $accSharePct = $stmtAccShare->fetchColumn();
                            if ($accSharePct !== false) {
                                $group_account_percentage = (float) $accSharePct;
                                $has_group_ownership = true;
                            }
                        }
                    }
                }
            } catch (Throwable $e) {
                // ignore — group tables may not exist yet
            }
        }
    } catch (Throwable $e) {
        // ignore
    }

    // Profit（仪表板 NET PROFIT 卡片）= 所有 Role 为 PROFIT 的账户余额总和
    echo json_encode([
        'success' => true,
        'data' => [
            'capital' => $result['capital']['total_balance'],
            'expenses' => $result['expenses']['total_balance'],
            'profit' => $result['profit']['total_balance'],
            'ownership_percentage' => $ownership_percentage,
            'has_ownership_setup' => $has_ownership_setup,
            'group_equity_percentage' => $group_equity_percentage,
            'group_account_percentage' => $group_account_percentage,
            'has_group_ownership' => $has_group_ownership,
            'period_total' => [
                'capital' => $result['capital']['period_total'],
                'expenses' => $result['expenses']['period_total'],
                'profit' => $result['profit']['period_total']
            ],
            'initial_balance' => [
                'capital' => $result['capital']['initial_balance'],
                'expenses' => $result['expenses']['initial_balance'],
                'profit' => $result['profit']['initial_balance']
            ],
            'daily_data' => [
                'capital' => $result['capital']['daily_data'],
                'expenses' => $result['expenses']['daily_data'],
                'profit' => $result['profit']['daily_data'],
                'profit_payment_flow_daily' => $profit_payment_flow_daily
            ],
            'date_range' => [
                'from' => $date_from,
                'to' => $date_to
            ]
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    error_log('dashboard_api: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'data' => null,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
}

/**
 * Run dashboard_api_main with overridden query params; capture JSON without extra HTTP.
 *
 * @return array{success:bool,message?:string,data?:mixed,error?:string}
 */
function dashboard_api_capture(array $queryParams): array
{
    $backupGet = $_GET;
    foreach ($queryParams as $key => $value) {
        if ($value === null || $value === '') {
            unset($_GET[$key]);
        } else {
            $_GET[$key] = (string) $value;
        }
    }

    ob_start();
    dashboard_api_main();
    $raw = ob_get_clean();
    $_GET = $backupGet;
    http_response_code(200);

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [
            'success' => false,
            'message' => 'Invalid dashboard response',
            'data' => null,
            'error' => 'Invalid dashboard response',
        ];
    }

    return $decoded;
}

if (!defined('DASHBOARD_API_SKIP_MAIN') || !DASHBOARD_API_SKIP_MAIN) {
    dashboard_api_main();
}

/**
 * 严格流水口径：仅统计 PAYMENT 且账户角色为 PROFIT 的当日净额
 * To Account(PROFIT) 记负数；From Account(PROFIT) 记正数
 */
function calculateProfitPaymentDailyFlow(
    PDO $pdo,
    int $company_id,
    string $date_from,
    string $date_to,
    ?string $filter_currency_code,
    bool $hasTransactionCurrency,
    bool $hasContraApproval
): array {
    $rows = [];

    if ($hasTransactionCurrency && $filter_currency_code !== null) {
        $sql = "
            SELECT DATE(t.transaction_date) AS date,
                   COALESCE(SUM(
                     CASE
                       WHEN to_ac.account_id IS NOT NULL THEN -t.amount
                       WHEN from_ac.account_id IS NOT NULL THEN t.amount
                       ELSE 0
                     END
                   ), 0) AS flow_amount
            FROM transactions t
            LEFT JOIN account to_acc
              ON to_acc.id = t.account_id
             AND UPPER(to_acc.role) = 'PROFIT'
            LEFT JOIN account_company to_ac
              ON to_ac.account_id = to_acc.id
             AND to_ac.company_id = t.company_id
            LEFT JOIN account from_acc
              ON from_acc.id = t.from_account_id
             AND UPPER(from_acc.role) = 'PROFIT'
            LEFT JOIN account_company from_ac
              ON from_ac.account_id = from_acc.id
             AND from_ac.company_id = t.company_id
            INNER JOIN currency c
              ON c.id = t.currency_id
             AND c.company_id = t.company_id
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.transaction_date BETWEEN ? AND ?
              AND UPPER(c.code) = ?
              " . ($hasContraApproval ? " AND (t.transaction_type <> 'CONTRA' OR t.approval_status = 'APPROVED')" : "") . "
              AND (to_ac.account_id IS NOT NULL OR from_ac.account_id IS NOT NULL)
            GROUP BY DATE(t.transaction_date)
            ORDER BY DATE(t.transaction_date)
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $date_from, $date_to, $filter_currency_code]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $sql = "
            SELECT DATE(t.transaction_date) AS date,
                   COALESCE(SUM(
                     CASE
                       WHEN to_ac.account_id IS NOT NULL THEN -t.amount
                       WHEN from_ac.account_id IS NOT NULL THEN t.amount
                       ELSE 0
                     END
                   ), 0) AS flow_amount
            FROM transactions t
            LEFT JOIN account to_acc
              ON to_acc.id = t.account_id
             AND UPPER(to_acc.role) = 'PROFIT'
            LEFT JOIN account_company to_ac
              ON to_ac.account_id = to_acc.id
             AND to_ac.company_id = t.company_id
            LEFT JOIN account from_acc
              ON from_acc.id = t.from_account_id
             AND UPPER(from_acc.role) = 'PROFIT'
            LEFT JOIN account_company from_ac
              ON from_ac.account_id = from_acc.id
             AND from_ac.company_id = t.company_id
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.transaction_date BETWEEN ? AND ?
              " . ($hasContraApproval ? " AND (t.transaction_type <> 'CONTRA' OR t.approval_status = 'APPROVED')" : "") . "
              AND (to_ac.account_id IS NOT NULL OR from_ac.account_id IS NOT NULL)
            GROUP BY DATE(t.transaction_date)
            ORDER BY DATE(t.transaction_date)
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $date_from, $date_to]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    $daily = [];
    foreach ($rows as $row) {
        $date = (string) ($row['date'] ?? '');
        if ($date === '')
            continue;
        $daily[$date] = dashboardOut($row['flow_amount'] ?? '0');
    }

    return $daily;
}

/**
 * 按 Currency 计算 B/F (Balance Forward)
 * 与 Transaction Search API 一致：Data Capture 按 dcd.currency_id；B/F 含 RATE 从 transaction_entry
 * @param bool|null $has_transaction_currency 若已缓存可传入，避免重复 SHOW COLUMNS
 */
function calculateBFByCurrency($pdo, $account_id, $currency_id, $date_from, $company_id, $has_transaction_currency = null, bool $exclude_clear = false)
{
    $bf = dashboardMoneyZero();

    // 1. 计算起始日期之前所有 Data Capture 的累计金额（按 Edit Formula 的 dcd.currency_id 过滤，与 Transaction 页一致）
    $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0) as total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
              AND dcd.currency_id = ?
              AND dc.capture_date < ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from]);
    $bf = dashboardMoneyAdd($bf, $stmt->fetchColumn());

    // 2. 计算起始日期之前所有 Cr/Dr（作为 To Account：PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM/WIN/LOSE；RATE 单独从 transaction_entry）
    if ($has_transaction_currency === null) {
        $has_transaction_currency = dashboardHasTransactionCurrency($pdo);
    }
    if ($has_transaction_currency) {
        $clearFilter = $exclude_clear ? " AND transaction_type <> 'CLEAR'" : "";
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -amount
                        WHEN transaction_type = 'CONTRA' THEN amount
                        WHEN transaction_type = 'CLEAR' THEN -amount
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN amount
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN amount
                        WHEN transaction_type = 'PAYMENT' THEN -amount
                        WHEN transaction_type = 'WIN' AND (description LIKE 'Process: %') THEN amount
                        WHEN transaction_type = 'LOSE' AND (description LIKE 'Process: %') THEN -amount
                        WHEN transaction_type = 'WIN' AND (description NOT LIKE 'Process: %' OR description IS NULL) THEN -amount
                        WHEN transaction_type = 'LOSE' AND (description NOT LIKE 'Process: %' OR description IS NULL) THEN amount
                        WHEN transaction_type = 'ADJUSTMENT' THEN amount
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions
                WHERE company_id = ?
                  AND account_id = ?
                  AND currency_id = ?
                  AND transaction_date < ?
                  AND transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'WIN', 'LOSE', 'ADJUSTMENT')"
            . $clearFilter
            . dashboardContraApprovedWhere($pdo, '');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $currency_id, $date_from]);
        $bf = dashboardMoneyAdd($bf, $stmt->fetchColumn());

        // 3. 计算起始日期之前所有 Cr/Dr（作为 From Account）
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN -amount
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN amount
                        WHEN transaction_type IN ('CONTRA', 'CLEAR') THEN amount
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions
                WHERE company_id = ?
                  AND from_account_id = ?
                  AND currency_id = ?
                  AND transaction_date < ?
                  AND transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')"
            . $clearFilter
            . dashboardContraApprovedWhere($pdo, '');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $currency_id, $date_from]);
        $bf = dashboardMoneyAdd($bf, $stmt->fetchColumn());
    }

    // 4. 起始日期之前的 RATE 从 transaction_entry 计算（与 Transaction Search API 一致）
    try {
        if (dashboardHasTransactionEntry($pdo)) {
            $rateStmt = $pdo->prepare("
                SELECT COALESCE(SUM(CASE
                  WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
                  WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -e.amount
                  WHEN e.entry_type = 'RATE_MIDDLEMAN' THEN e.amount
                  ELSE e.amount
                END), 0) AS total
                FROM transaction_entry e
                JOIN transactions h ON e.header_id = h.id
                WHERE h.company_id = ?
                  AND e.company_id = ?
                  AND h.transaction_type = 'RATE'
                  AND e.account_id = ?
                  AND e.currency_id = ?
                  AND h.transaction_date < ?
            ");
            $rateStmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from]);
            $bf = dashboardMoneyAdd($bf, $rateStmt->fetchColumn());
        }
    } catch (Throwable $e) {
        // 忽略
    }

    return $bf;
}

/**
 * 按 Currency 计算 Win/Loss
 * 与 Transaction Search API 一致：Data Capture（dcd.currency_id）
 * + 所有 Bank Process 的 WIN/LOSE（description 以 Process: 开头）
 * + RATE Middle-Man 手续费（RATE_MIDDLEMAN）
 */
function calculateWinLossByCurrency($pdo, $account_id, $currency_id, $date_from, $date_to, $company_id)
{
    $win_loss = dashboardMoneyZero();

    // 1. 日期范围内的 Data Capture（按 dcd.currency_id 过滤）
    $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0) as total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
              AND dcd.currency_id = ?
              AND dc.capture_date BETWEEN ? AND ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from, $date_to]);
    $win_loss = dashboardMoneyAdd($win_loss, $stmt->fetchColumn());

    // 2. 所有 Bank Process 的 WIN/LOSE（description 以 Process: 开头，与 Transaction 页一致）
    if (dashboardHasTransactionCurrency($pdo)) {
        $sql = "SELECT COALESCE(SUM(CASE WHEN transaction_type = 'WIN' THEN amount WHEN transaction_type = 'LOSE' THEN -amount ELSE 0 END), 0) as total
                FROM transactions
                WHERE company_id = ? AND account_id = ? AND transaction_date BETWEEN ? AND ?
                  AND currency_id = ? AND transaction_type IN ('WIN', 'LOSE')
                  AND (description LIKE 'Process: %')";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $currency_id]);
        $win_loss = dashboardMoneyAdd($win_loss, $stmt->fetchColumn());

        // 3. 手动 PROFIT（WIN/LOSE，与 Transaction List calculateWinLossByCurrency 一致）
        $manualDesc = dashboardManualProfitDescSql('t');
        $sql = "SELECT COALESCE(SUM(CASE
                    WHEN t.transaction_type = 'WIN' AND {$manualDesc} THEN -t.amount
                    WHEN t.transaction_type = 'LOSE' AND {$manualDesc} THEN t.amount
                    ELSE 0 END), 0) as total
                FROM transactions t
                WHERE t.company_id = ? AND t.account_id = ? AND t.transaction_date BETWEEN ? AND ?
                  AND t.currency_id = ? AND t.transaction_type IN ('WIN', 'LOSE')"
            . dashboardContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $currency_id]);
        $win_loss = dashboardMoneyAdd($win_loss, $stmt->fetchColumn());

        $sql = "SELECT COALESCE(SUM(CASE
                    WHEN t.transaction_type = 'WIN' AND {$manualDesc} THEN t.amount
                    WHEN t.transaction_type = 'LOSE' AND {$manualDesc} THEN -t.amount
                    ELSE 0 END), 0) as total
                FROM transactions t
                WHERE t.company_id = ? AND t.from_account_id = ? AND t.transaction_date BETWEEN ? AND ?
                  AND t.currency_id = ? AND t.transaction_type IN ('WIN', 'LOSE')
                  AND t.from_account_id IS NOT NULL"
            . dashboardContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $currency_id]);
        $win_loss = dashboardMoneyAdd($win_loss, $stmt->fetchColumn());

        $sql = "SELECT COALESCE(SUM(amount), 0) as total
                FROM transactions
                WHERE company_id = ? AND account_id = ? AND transaction_date BETWEEN ? AND ?
                  AND currency_id = ? AND transaction_type = 'ADJUSTMENT'"
            . dashboardContraApprovedWhere($pdo, '');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $currency_id]);
        $win_loss = dashboardMoneyAdd($win_loss, $stmt->fetchColumn());

        try {
            if (dashboardHasTransactionEntry($pdo)) {
                $rateStmt = $pdo->prepare("
                    SELECT COALESCE(SUM(e.amount), 0) AS total
                    FROM transaction_entry e
                    JOIN transactions h ON e.header_id = h.id
                    WHERE h.company_id = ?
                      AND e.company_id = ?
                      AND h.transaction_type = 'RATE'
                      AND e.entry_type = 'RATE_MIDDLEMAN'
                      AND e.account_id = ?
                      AND e.currency_id = ?
                      AND h.transaction_date BETWEEN ? AND ?
                ");
                $rateStmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from, $date_to]);
                $win_loss = dashboardMoneyAdd($win_loss, $rateStmt->fetchColumn());
            }
        } catch (Throwable $e) {
            // 忽略
        }
    }

    return $win_loss;
}

/**
 * 按 Currency 计算 Cr/Dr
 * 与 Transaction Search API 一致：PAYMENT/RECEIVE/CONTRA/CLAIM + WIN/LOSE 中非 Bank Process 的（Process: 在 Win/Loss）；RATE 从 transaction_entry
 * @param bool|null $has_transaction_currency 若已缓存可传入，避免重复 SHOW COLUMNS
 */
function calculateCrDrByCurrency($pdo, $account_id, $currency_id, $date_from, $date_to, $company_id, $has_transaction_currency = null, bool $exclude_clear = false)
{
    $cr_dr = dashboardMoneyZero();
    $has_transactions = false;

    if ($has_transaction_currency === null) {
        $has_transaction_currency = dashboardHasTransactionCurrency($pdo);
    }

    if ($has_transaction_currency) {
        // 新环境（有 currency_id 字段）：逻辑与 search_api.php 保持一致
        $clearFilter = $exclude_clear ? " AND t.transaction_type <> 'CLEAR'" : "";
        $sql = "
            SELECT
                COALESCE(SUM(
                    CASE
                        -- 作为 To Account（收到 / 支付）；CONTRA 时 TO 显示负数
                        WHEN t.account_id = :acc_id AND t.transaction_type IN ('RECEIVE', 'CLAIM') THEN -t.amount
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'CLEAR' THEN -t.amount
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'CONTRA' THEN -t.amount
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN t.amount
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN t.amount
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' THEN -t.amount

                        -- 作为 From Account（支付 / 收到）；CONTRA 时 FROM 显示正数
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN 0
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN -t.amount
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' THEN t.amount
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'CLEAR' THEN t.amount
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'CONTRA' THEN t.amount
                        WHEN t.from_account_id = :acc_id AND t.transaction_type IN ('RECEIVE', 'CLAIM') THEN t.amount

                        ELSE 0
                    END
                ), 0) AS cr_dr,
                COUNT(*) AS txn_count
            FROM transactions t
            WHERE t.company_id = :company_id
              AND t.transaction_date BETWEEN :date_from AND :date_to
              AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
              AND t.currency_id = :currency_id
              AND (t.account_id = :acc_id OR t.from_account_id = :acc_id)
              " . $clearFilter . "
              " . dashboardContraApprovedWhere($pdo, 't') . "
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':company_id' => $company_id,
            ':date_from' => $date_from,
            ':date_to' => $date_to,
            ':currency_id' => $currency_id,
            ':acc_id' => $account_id,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $cr_dr = dashboardMoneyAdd($cr_dr, $row['cr_dr'] ?? '0');
        $txn_count = (int) ($row['txn_count'] ?? 0);
        $has_transactions = $txn_count > 0;

        // 本期 RATE 从 transaction_entry 计算（与 Transaction Search API 一致）
        // RATE_MIDDLEMAN 已归类到 Win/Loss，这里只保留其余 RATE 分录在 Cr/Dr
        try {
            if (dashboardHasTransactionEntry($pdo)) {
                $rateStmt = $pdo->prepare("
                    SELECT COALESCE(SUM(CASE
                      WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
                      WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -e.amount
                      ELSE e.amount
                    END), 0) AS total
                    FROM transaction_entry e
                    JOIN transactions h ON e.header_id = h.id
                    WHERE h.company_id = ?
                      AND e.company_id = ?
                      AND h.transaction_type = 'RATE'
                      AND e.account_id = ?
                      AND e.currency_id = ?
                      AND h.transaction_date BETWEEN ? AND ?
                      AND e.entry_type <> 'RATE_MIDDLEMAN'
                ");
                $rateStmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from, $date_to]);
                $cr_dr = dashboardMoneyAdd($cr_dr, $rateStmt->fetchColumn());
            }
        } catch (Throwable $e) {
            // 忽略
        }
    } else {
        // 旧环境（没有 currency_id 字段）：沿用 search_api.php 的旧逻辑
        $clearFilter = $exclude_clear ? " AND transaction_type <> 'CLEAR'" : "";
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -t.amount
                        WHEN transaction_type = 'CLEAR' THEN -t.amount
                        WHEN transaction_type = 'CONTRA' THEN -t.amount
                        WHEN transaction_type = 'PAYMENT' THEN -t.amount
                        ELSE 0
                    END), 0) as cr_dr,
                    COUNT(*) as txn_count
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.account_id = ?
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')"
            . $clearFilter
            . dashboardContraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $cr_dr = dashboardMoneyAdd($cr_dr, $row['cr_dr'] ?? '0');
        $txn_count = (int) ($row['txn_count'] ?? 0);
        $has_transactions = $txn_count > 0;

        // From Account（旧逻辑）；CONTRA 时 FROM 显示正数
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type = 'PAYMENT' THEN t.amount
                        WHEN transaction_type = 'CLEAR' THEN t.amount
                        WHEN transaction_type = 'CONTRA' THEN t.amount
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN t.amount
                        ELSE 0
                    END), 0) as cr_dr,
                    COUNT(*) as txn_count
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.from_account_id = ?
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')"
            . $clearFilter
            . dashboardContraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $cr_dr = dashboardMoneyAdd($cr_dr, $row['cr_dr'] ?? '0');
        $txn_count += (int) ($row['txn_count'] ?? 0);
        $has_transactions = $has_transactions || $txn_count > 0;

        // RATE 分录（旧环境也从 transaction_entry 计算）
        // RATE_MIDDLEMAN 已归类到 Win/Loss，这里只保留其余 RATE 分录在 Cr/Dr
        try {
            if (dashboardHasTransactionEntry($pdo)) {
                $rateStmt = $pdo->prepare("
                    SELECT COALESCE(SUM(CASE
                      WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
                      WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -e.amount
                      ELSE e.amount
                    END), 0) AS total
                    FROM transaction_entry e
                    JOIN transactions h ON e.header_id = h.id
                    WHERE h.company_id = ?
                      AND e.company_id = ?
                      AND h.transaction_type = 'RATE'
                      AND e.account_id = ?
                      AND e.currency_id = ?
                      AND h.transaction_date BETWEEN ? AND ?
                      AND e.entry_type <> 'RATE_MIDDLEMAN'
                ");
                $rateStmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from, $date_to]);
                $cr_dr = dashboardMoneyAdd($cr_dr, $rateStmt->fetchColumn());
            }
        } catch (Throwable $e) {
            // 忽略
        }
    }

    return ['value' => $cr_dr, 'has_transactions' => $has_transactions];
}