<?php
/**
 * Group Earnings API
 * 计算某个 Group 下所有公司的盈利，并按股东的持股比例分配收益
 * Net Profit 与 dashboard_api.php 完全同口径（B/F + 期间 + 可选币别过滤）
 *
 * GET params:
 *   group_id   - 组别ID（必填）
 *   date_from  - 开始日期 YYYY-MM-DD（可选，默认当月1号）
 *   date_to    - 结束日期 YYYY-MM-DD（可选，默认当月最后一天）
 *   currency   - 币种代码，如 MYR / USD（可选，不传或传 all = 全部币种）
 */
require_once '../../session_check.php';
require_once '../../config.php';
require_once '../../permissions.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$group_id  = trim($_GET['group_id'] ?? '');
$date_from = $_GET['date_from'] ?? date('Y-m-01');
$date_to   = $_GET['date_to']   ?? date('Y-m-t');
$filter_currency_code = null;
if (isset($_GET['currency']) && trim($_GET['currency']) !== '' && strtolower(trim($_GET['currency'])) !== 'all') {
    $filter_currency_code = strtoupper(trim($_GET['currency']));
}

if ($group_id === '') {
    echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
    exit();
}

// ── Schema helpers (static cache per request) ─────────────────────────────
function geHasTransactionCurrency(PDO $pdo): bool {
    static $v = null;
    if ($v !== null) return $v;
    try { $v = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'currency_id'")->rowCount() > 0; }
    catch (Throwable $e) { $v = false; }
    return $v;
}
function geHasTransactionEntry(PDO $pdo): bool {
    static $v = null;
    if ($v !== null) return $v;
    try { $v = $pdo->query("SHOW TABLES LIKE 'transaction_entry'")->rowCount() > 0; }
    catch (Throwable $e) { $v = false; }
    return $v;
}
function geContraApprovedWhere(PDO $pdo, string $alias = 't'): string {
    static $has = null;
    if ($has === null) {
        try { $has = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'approval_status'")->rowCount() > 0; }
        catch (Throwable $e) { $has = false; }
    }
    if (!$has) return '';
    $a = $alias !== '' ? $alias . '.' : '';
    return " AND ({$a}transaction_type <> 'CONTRA' OR {$a}approval_status = 'APPROVED')";
}

/**
 * Transaction currency filter — identical to dashboardTxnCurrencyFilter()
 * Includes IS NULL fallback for backward compatibility
 */
function geTxnCurrencyFilter(string $accountColumn, int $companyId, int $currencyId): array {
    $sql = " AND (
        t.currency_id = ?
        OR (
            t.currency_id IS NULL
            AND EXISTS (
                SELECT 1
                FROM data_capture_details dcd2
                JOIN data_captures dc2 ON dcd2.capture_id = dc2.id
                WHERE dcd2.company_id = ? AND dc2.company_id = ?
                  AND CAST(dcd2.account_id AS CHAR) = CAST(t.`{$accountColumn}` AS CHAR)
                  AND dcd2.currency_id = ?
            )
        )
    )";
    return [$sql, [$currencyId, $companyId, $companyId, $currencyId]];
}

/**
 * 计算单公司 PROFIT role 的净余额
 * 与 dashboard_api.php 完全相同：B/F + 期间增量 + RATE_MIDDLEMAN
 * @param int|null $currencyId  null = 全部币种；传值 = 仅该币种（与 dashboard currency 过滤一致）
 */
function getCompanyProfit(PDO $pdo, int $companyId, string $dateFrom, string $dateTo, ?int $currencyId = null): float
{
    $hasCurrency = geHasTransactionCurrency($pdo);
    $hasEntry    = geHasTransactionEntry($pdo);
    $contraWhere = geContraApprovedWhere($pdo, 't');

    // 账户列表（与 dashboard 相同，应用权限过滤）
    $acctSql = "SELECT DISTINCT a.id
                FROM account a
                INNER JOIN account_company ac ON a.id = ac.account_id
                WHERE ac.company_id = ?
                  AND UPPER(a.role) = 'PROFIT'
                  AND a.status = 'active'";
    list($acctSql, $acctParams) = filterAccountsByPermissions($pdo, $acctSql, [], $companyId);
    $acctSql = preg_replace('/\bAND id IN\b/i', 'AND a.id IN', $acctSql);
    $acctSql = preg_replace('/\bWHERE id IN\b/i', 'WHERE a.id IN', $acctSql);
    $stmtAcct = $pdo->prepare($acctSql);
    $stmtAcct->execute(array_merge([$companyId], $acctParams));
    $accountIds = $stmtAcct->fetchAll(PDO::FETCH_COLUMN);
    if (empty($accountIds)) return 0.0;

    $ph = implode(',', array_fill(0, count($accountIds), '?'));
    $total_bf     = 0.0;
    $total_period = 0.0;

    // 币别过滤参数
    $cfDcd   = $currencyId !== null ? ' AND dcd.currency_id = ?' : '';
    $cpDcd   = $currencyId !== null ? [$currencyId] : [];
    $cfEntry = $currencyId !== null ? ' AND e.currency_id = ?' : '';
    $cpEntry = $currencyId !== null ? [$currencyId] : [];

    $cfTTo = ''; $cpTTo = [];
    $cfTFrom = ''; $cpTFrom = [];
    if ($hasCurrency && $currencyId !== null) {
        [$cfTTo,   $cpTTo]   = geTxnCurrencyFilter('account_id',      $companyId, $currencyId);
        [$cfTFrom, $cpTFrom] = geTxnCurrencyFilter('from_account_id', $companyId, $currencyId);
    }

    // ════ B/F (< dateFrom) ════════════════════════════════════════

    // A-BF: Data Capture B/F
    $s = $pdo->prepare("
        SELECT COALESCE(SUM(dcd.processed_amount), 0)
        FROM data_capture_details dcd
        JOIN data_captures dc ON dcd.capture_id = dc.id
        WHERE dc.company_id = ?
          AND dcd.company_id = ?
          AND dcd.account_id IN ($ph)
          AND dc.capture_date < ?" . $cfDcd);
    $s->execute(array_merge([$companyId, $companyId], $accountIds, [$dateFrom], $cpDcd));
    $total_bf += (float) $s->fetchColumn();

    if ($hasCurrency) {
        // B-BF: Transactions To Account B/F
        $s = $pdo->prepare("
            SELECT COALESCE(SUM(CASE
                WHEN transaction_type IN ('RECEIVE','CLAIM') THEN -amount
                WHEN transaction_type = 'CONTRA'            THEN -amount
                WHEN transaction_type = 'CLEAR'             THEN -amount
                WHEN transaction_type = 'PAYMENT'           THEN -amount
                WHEN transaction_type = 'WIN'  AND (description LIKE 'Process: %') THEN  amount
                WHEN transaction_type = 'LOSE' AND (description LIKE 'Process: %') THEN -amount
                WHEN transaction_type = 'WIN'  AND (description NOT LIKE 'Process: %' OR description IS NULL) THEN -amount
                WHEN transaction_type = 'LOSE' AND (description NOT LIKE 'Process: %' OR description IS NULL) THEN  amount
                ELSE 0
            END), 0)
            FROM transactions t
            WHERE t.company_id = ?
              AND t.account_id IN ($ph)
              AND t.transaction_date < ?" . $cfTTo . $contraWhere);
        $s->execute(array_merge([$companyId], $accountIds, [$dateFrom], $cpTTo));
        $total_bf += (float) $s->fetchColumn();

        // C-BF: Transactions From Account B/F
        $s = $pdo->prepare("
            SELECT COALESCE(SUM(CASE
                WHEN transaction_type IN ('PAYMENT','RECEIVE','CLAIM','CLEAR') THEN amount
                WHEN transaction_type = 'CONTRA' THEN amount
                ELSE 0
            END), 0)
            FROM transactions t
            WHERE t.company_id = ?
              AND t.from_account_id IN ($ph)
              AND t.transaction_date < ?" . $cfTFrom . $contraWhere);
        $s->execute(array_merge([$companyId], $accountIds, [$dateFrom], $cpTFrom));
        $total_bf += (float) $s->fetchColumn();

        // D-BF: RATE entries B/F
        if ($hasEntry) {
            try {
                $s = $pdo->prepare("
                    SELECT COALESCE(SUM(CASE
                        WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
                        WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO')     THEN -e.amount
                        WHEN e.entry_type = 'RATE_MIDDLEMAN'                          THEN  e.amount
                        ELSE e.amount
                    END), 0)
                    FROM transaction_entry e
                    JOIN transactions h ON e.header_id = h.id
                    WHERE h.company_id = ?
                      AND e.company_id = ?
                      AND e.account_id IN ($ph)
                      AND h.transaction_date < ?" . $cfEntry);
                $s->execute(array_merge([$companyId, $companyId], $accountIds, [$dateFrom], $cpEntry));
                $total_bf += (float) $s->fetchColumn();
            } catch (Throwable $e) {}
        }
    }

    // ════ 期间增量 (BETWEEN) ══════════════════════════════════════

    // A-P: Data Capture 期间
    $s = $pdo->prepare("
        SELECT COALESCE(SUM(dcd.processed_amount), 0)
        FROM data_capture_details dcd
        JOIN data_captures dc ON dcd.capture_id = dc.id
        WHERE dc.company_id = ?
          AND dcd.company_id = ?
          AND dcd.account_id IN ($ph)
          AND dc.capture_date BETWEEN ? AND ?" . $cfDcd);
    $s->execute(array_merge([$companyId, $companyId], $accountIds, [$dateFrom, $dateTo], $cpDcd));
    $total_period += (float) $s->fetchColumn();

    if ($hasCurrency) {
        // B-P: Transactions To Account 期间
        $s = $pdo->prepare("
            SELECT COALESCE(SUM(CASE
                WHEN transaction_type IN ('RECEIVE','CLAIM','RATE') THEN -t.amount
                WHEN transaction_type = 'CONTRA'                    THEN -t.amount
                WHEN transaction_type = 'CLEAR'                     THEN -t.amount
                WHEN transaction_type = 'PAYMENT'                   THEN -t.amount
                WHEN t.transaction_type = 'WIN'  AND (t.description LIKE 'Process: %') THEN  t.amount
                WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %') THEN -t.amount
                WHEN t.transaction_type = 'WIN'  AND (t.description NOT LIKE 'Process: %' OR t.description IS NULL) THEN -t.amount
                WHEN t.transaction_type = 'LOSE' AND (t.description NOT LIKE 'Process: %' OR t.description IS NULL) THEN  t.amount
                ELSE 0
            END), 0)
            FROM transactions t
            WHERE t.company_id = ?
              AND t.account_id IN ($ph)
              AND t.transaction_date BETWEEN ? AND ?
              AND t.transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLEAR','CLAIM','RATE','WIN','LOSE')" . $cfTTo . $contraWhere);
        $s->execute(array_merge([$companyId], $accountIds, [$dateFrom, $dateTo], $cpTTo));
        $total_period += (float) $s->fetchColumn();

        // C-P: Transactions From Account 期间
        $s = $pdo->prepare("
            SELECT COALESCE(SUM(CASE
                WHEN transaction_type = 'CONTRA'                              THEN t.amount
                WHEN transaction_type = 'CLEAR'                               THEN t.amount
                WHEN transaction_type IN ('PAYMENT','RECEIVE','CLAIM','RATE') THEN t.amount
                ELSE 0
            END), 0)
            FROM transactions t
            WHERE t.company_id = ?
              AND t.from_account_id IN ($ph)
              AND t.transaction_date BETWEEN ? AND ?
              AND t.transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLEAR','CLAIM','RATE')" . $cfTFrom . $contraWhere);
        $s->execute(array_merge([$companyId], $accountIds, [$dateFrom, $dateTo], $cpTFrom));
        $total_period += (float) $s->fetchColumn();

        // D-P: RATE entries 期间
        if ($hasEntry) {
            try {
                $s = $pdo->prepare("
                    SELECT COALESCE(SUM(CASE
                        WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
                        WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO')     THEN -e.amount
                        WHEN e.entry_type = 'RATE_MIDDLEMAN'                          THEN  e.amount
                        ELSE e.amount
                    END), 0)
                    FROM transaction_entry e
                    JOIN transactions h ON e.header_id = h.id
                    WHERE h.company_id = ?
                      AND e.company_id = ?
                      AND e.account_id IN ($ph)
                      AND h.transaction_date BETWEEN ? AND ?" . $cfEntry);
                $s->execute(array_merge([$companyId, $companyId], $accountIds, [$dateFrom, $dateTo], $cpEntry));
                $total_period += (float) $s->fetchColumn();
            } catch (Throwable $e) {}
        }
    }

    // ════ RATE_MIDDLEMAN 补充（对应 dashboard_api.php 464-517行）════
    if ($hasEntry) {
        try {
            $s = $pdo->prepare("
                SELECT COALESCE(SUM(ROUND(e.amount, 2)), 0)
                FROM transaction_entry e
                JOIN transactions h ON e.header_id = h.id
                WHERE h.company_id = ?
                  AND e.company_id = ?
                  AND e.entry_type = 'RATE_MIDDLEMAN'
                  AND h.transaction_date BETWEEN ? AND ?" . $cfEntry);
            $s->execute(array_merge([$companyId, $companyId, $dateFrom, $dateTo], $cpEntry));
            $total_period += (float) $s->fetchColumn();
        } catch (Throwable $e) {}
    }

    return round($total_bf + $total_period, 2);
}

// ── Main Logic ────────────────────────────────────────────────────────────
try {
    $current_user_role = strtolower($_SESSION['role'] ?? '');
    $owner_id = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);

    if ($current_user_role === 'owner') {
        $stmt = $pdo->prepare("
            SELECT c.id, c.company_id AS name
            FROM company c
            WHERE c.owner_id = ? AND UPPER(c.group_id) = UPPER(?) AND c.company_id != ''
            ORDER BY c.company_id ASC
        ");
        $stmt->execute([$owner_id, $group_id]);
    } else {
        $stmt = $pdo->prepare("
            SELECT c.id, c.company_id AS name
            FROM company c
            INNER JOIN user_company_map ucm ON c.id = ucm.company_id
            WHERE ucm.user_id = ? AND UPPER(c.group_id) = UPPER(?) AND c.company_id != ''
            ORDER BY c.company_id ASC
        ");
        $stmt->execute([(int)$_SESSION['user_id'], $group_id]);
    }
    $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($companies)) {
        echo json_encode(['status' => 'success', 'data' => [
            'group_id' => $group_id, 'date_from' => $date_from, 'date_to' => $date_to,
            'currency' => $filter_currency_code ?? 'all',
            'currencies' => [], 'companies' => [], 'shareholders' => [], 'total_profit' => 0
        ]]);
        exit();
    }

    // 收集所有公司的可用币别
    $currencySet = [];
    foreach ($companies as $c) {
        $cs = $pdo->prepare("SELECT UPPER(code) AS code FROM currency WHERE company_id = ? ORDER BY code");
        $cs->execute([$c['id']]);
        foreach ($cs->fetchAll(PDO::FETCH_COLUMN) as $code) {
            $currencySet[$code] = true;
        }
    }
    $availableCurrencies = array_keys($currencySet);
    sort($availableCurrencies);

    $tableExists  = $pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() > 0;
    $hasOwnerType = $tableExists
        ? $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'")->rowCount() > 0
        : false;

    $companyIds = array_column($companies, 'id');
    $in = implode(',', array_fill(0, count($companyIds), '?'));

    // 计算每公司净利润（按选定币别过滤）
    $companyProfits = [];
    foreach ($companies as $c) {
        $currencyId = null;
        if ($filter_currency_code !== null) {
            $cs = $pdo->prepare("SELECT id FROM currency WHERE company_id = ? AND UPPER(code) = ? LIMIT 1");
            $cs->execute([$c['id'], $filter_currency_code]);
            $cid = $cs->fetchColumn();
            if ($cid === false) {
                $companyProfits[$c['id']] = 0.0;
                continue;
            }
            $currencyId = (int)$cid;
        }
        $companyProfits[$c['id']] = getCompanyProfit($pdo, (int)$c['id'], $date_from, $date_to, $currencyId);
    }
    $totalProfit = array_sum($companyProfits);

    // 股东列表
    $shareholders   = [];
    $companyNameMap = array_column($companies, 'name', 'id');
    if ($tableExists && $hasOwnerType) {
        $ownerships = $pdo->prepare("
            SELECT co.company_id, co.account_id, co.percentage, co.owner_type,
                   COALESCE(o.name, u.name) AS shareholder_name,
                   COALESCE(o.owner_code, u.login_id) AS shareholder_login
            FROM company_ownership co
            LEFT JOIN owner o ON co.account_id = o.id AND co.owner_type = 'owner'
            LEFT JOIN user  u ON co.account_id = u.id AND co.owner_type = 'user'
            WHERE co.company_id IN ($in)
              AND co.owner_type IN ('owner','user')
              AND co.percentage > 0
            ORDER BY co.owner_type, co.account_id
        ");
        $ownerships->execute($companyIds);
        foreach ($ownerships->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key    = $row['owner_type'] . '_' . $row['account_id'];
            $cId    = (int)$row['company_id'];
            $pct    = (float)$row['percentage'];
            $profit = $companyProfits[$cId] ?? 0;
            $earn   = round($profit * $pct / 100, 2);
            if (!isset($shareholders[$key])) {
                $shareholders[$key] = [
                    'account_id'     => ($row['owner_type'] === 'owner' ? 'O_' : 'U_') . $row['account_id'],
                    'name'           => $row['shareholder_name'] ?? ('ID:' . $row['account_id']),
                    'login'          => $row['shareholder_login'] ?? '',
                    'total_earnings' => 0,
                    'companies'      => []
                ];
            }
            $shareholders[$key]['companies'][] = [
                'company_id'   => $cId,
                'company_name' => $companyNameMap[$cId] ?? 'Unknown',
                'pct'          => $pct,
                'profit'       => $profit,
                'earnings'     => $earn
            ];
            $shareholders[$key]['total_earnings'] += $earn;
        }
    }

    $shareholderList = array_values($shareholders);
    usort($shareholderList, fn($a, $b) => $b['total_earnings'] <=> $a['total_earnings']);
    foreach ($shareholderList as &$sh) { $sh['total_earnings'] = round($sh['total_earnings'], 2); }
    unset($sh);

    echo json_encode(['status' => 'success', 'data' => [
        'group_id'     => $group_id,
        'date_from'    => $date_from,
        'date_to'      => $date_to,
        'currency'     => $filter_currency_code ?? 'all',
        'currencies'   => $availableCurrencies,
        'companies'    => array_map(fn($c) => [
            'id'     => (int)$c['id'],
            'name'   => $c['name'],
            'profit' => $companyProfits[$c['id']] ?? 0
        ], $companies),
        'shareholders' => $shareholderList,
        'total_profit' => round($totalProfit, 2)
    ]]);

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
