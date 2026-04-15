<?php
/**
 * Group Earnings API
 * 计算某个 Group 下所有公司的盈利，并按股东的持股比例分配收益
 *
 * GET params:
 *   group_id   - 组别ID（必填）
 *   date_from  - 开始日期 YYYY-MM-DD（可选，默认当月1号）
 *   date_to    - 结束日期 YYYY-MM-DD（可选，默认当月最后一天）
 */
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$group_id  = trim($_GET['group_id'] ?? '');
$date_from = $_GET['date_from'] ?? date('Y-m-01');
$date_to   = $_GET['date_to']   ?? date('Y-m-t');

if ($group_id === '') {
    echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
    exit();
}

// ── Schema helpers ────────────────────────────────────────────────────────
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
function geHasContraApproval(PDO $pdo): bool {
    static $v = null;
    if ($v !== null) return $v;
    try { $v = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'approval_status'")->rowCount() > 0; }
    catch (Throwable $e) { $v = false; }
    return $v;
}

/**
 * 计算某公司在指定日期范围内的净利润（Net Profit = PROFIT role 账户余额总和）
 */
function getCompanyProfit(PDO $pdo, int $companyId, string $dateFrom, string $dateTo): float
{
    $hasCurrency = geHasTransactionCurrency($pdo);
    $hasEntry    = geHasTransactionEntry($pdo);
    $hasContra   = geHasContraApproval($pdo);

    // 拿该公司所有 PROFIT role 的 active 账户
    $stmt = $pdo->prepare("
        SELECT DISTINCT a.id
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE ac.company_id = ? AND UPPER(a.role) = 'PROFIT' AND a.status = 'active'
    ");
    $stmt->execute([$companyId]);
    $accountIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($accountIds)) return 0.0;

    $in    = implode(',', array_fill(0, count($accountIds), '?'));
    $total = 0.0;

    // ── A. Data Capture 汇总 ───────────────────────────────────────────────
    $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0)
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dc.company_id = ?
              AND dcd.company_id = ?
              AND dcd.account_id IN ($in)
              AND dc.capture_date BETWEEN ? AND ?";
    $s = $pdo->prepare($sql);
    $s->execute(array_merge([$companyId, $companyId], $accountIds, [$dateFrom, $dateTo]));
    $total += (float) $s->fetchColumn();

    if ($hasCurrency) {
        $contraClause = $hasContra
            ? " AND (t.transaction_type <> 'CONTRA' OR t.approval_status = 'APPROVED')"
            : "";

        // ── B. Transactions To Account ────────────────────────────────────
        $sql = "SELECT COALESCE(SUM(CASE
                    WHEN transaction_type IN ('RECEIVE','CLAIM') THEN -t.amount
                    WHEN transaction_type = 'CONTRA' THEN -t.amount
                    WHEN transaction_type = 'CLEAR'  THEN -t.amount
                    WHEN transaction_type = 'PAYMENT' THEN -t.amount
                    WHEN transaction_type = 'WIN'  AND (t.description LIKE 'Process: %') THEN  t.amount
                    WHEN transaction_type = 'LOSE' AND (t.description LIKE 'Process: %') THEN -t.amount
                    WHEN transaction_type = 'WIN'  AND (t.description NOT LIKE 'Process: %' OR t.description IS NULL) THEN -t.amount
                    WHEN transaction_type = 'LOSE' AND (t.description NOT LIKE 'Process: %' OR t.description IS NULL) THEN  t.amount
                    ELSE 0
                END), 0)
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.account_id IN ($in)
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLEAR','CLAIM','WIN','LOSE')"
                . $contraClause;
        $s = $pdo->prepare($sql);
        $s->execute(array_merge([$companyId], $accountIds, [$dateFrom, $dateTo]));
        $total += (float) $s->fetchColumn();

        // ── C. Transactions From Account ─────────────────────────────────
        $sql = "SELECT COALESCE(SUM(CASE
                    WHEN transaction_type IN ('PAYMENT','RECEIVE','CLAIM','CLEAR') THEN t.amount
                    WHEN transaction_type = 'CONTRA' THEN t.amount
                    ELSE 0
                END), 0)
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.from_account_id IN ($in)
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLEAR','CLAIM')"
                . $contraClause;
        $s = $pdo->prepare($sql);
        $s->execute(array_merge([$companyId], $accountIds, [$dateFrom, $dateTo]));
        $total += (float) $s->fetchColumn();

        // ── D. RATE entries ──────────────────────────────────────────────
        if ($hasEntry) {
            try {
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
                          AND e.account_id IN ($in)
                          AND h.transaction_date BETWEEN ? AND ?";
                $s = $pdo->prepare($sql);
                $s->execute(array_merge([$companyId, $companyId], $accountIds, [$dateFrom, $dateTo]));
                $total += (float) $s->fetchColumn();
            } catch (Throwable $e) {}
        }
    }

    // ── E. RATE_MIDDLEMAN（直接累加到 Profit，与 dashboard_api 保持一致）──
    if ($hasEntry) {
        try {
            $sql = "SELECT COALESCE(SUM(ROUND(e.amount,2)), 0)
                    FROM transaction_entry e
                    JOIN transactions h ON e.header_id = h.id
                    WHERE h.company_id = ?
                      AND e.company_id = ?
                      AND e.entry_type = 'RATE_MIDDLEMAN'
                      AND h.transaction_date BETWEEN ? AND ?";
            $s = $pdo->prepare($sql);
            $s->execute([$companyId, $companyId, $dateFrom, $dateTo]);
            $total += (float) $s->fetchColumn();
        } catch (Throwable $e) {}
    }

    return round($total, 2);
}

// ── Main Logic ────────────────────────────────────────────────────────────
try {
    $current_user_role = strtolower($_SESSION['role'] ?? '');
    $owner_id = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);

    // 1. 拿出该 group 下所有属于此 owner 的公司
    if ($current_user_role === 'owner') {
        $stmt = $pdo->prepare("
            SELECT c.id, c.company_id AS name, c.expiration_date
            FROM company c
            WHERE c.owner_id = ? AND UPPER(c.group_id) = UPPER(?)
              AND c.company_id != ''
            ORDER BY c.company_id ASC
        ");
        $stmt->execute([$owner_id, $group_id]);
    } else {
        // 普通用户：通过 user_company_map 验证
        $stmt = $pdo->prepare("
            SELECT c.id, c.company_id AS name, c.expiration_date
            FROM company c
            INNER JOIN user_company_map ucm ON c.id = ucm.company_id
            WHERE ucm.user_id = ? AND UPPER(c.group_id) = UPPER(?)
              AND c.company_id != ''
            ORDER BY c.company_id ASC
        ");
        $stmt->execute([(int)$_SESSION['user_id'], $group_id]);
    }
    $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($companies)) {
        echo json_encode([
            'status' => 'success',
            'data'   => [
                'group_id'     => $group_id,
                'date_from'    => $date_from,
                'date_to'      => $date_to,
                'companies'    => [],
                'shareholders' => [],
                'total_profit' => 0
            ]
        ]);
        exit();
    }

    // 2. 检查 company_ownership 表是否存在及 owner_type 列
    $tableExists = $pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() > 0;
    $hasOwnerType = $tableExists
        ? $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'")->rowCount() > 0
        : false;

    $companyIds = array_column($companies, 'id');
    $in = implode(',', array_fill(0, count($companyIds), '?'));

    // 3. 计算每公司的净利润
    $companyProfits = []; // company_id => profit
    foreach ($companies as $c) {
        $companyProfits[$c['id']] = getCompanyProfit($pdo, (int)$c['id'], $date_from, $date_to);
    }
    $totalProfit = array_sum($companyProfits);

    // 4. 拿所有股东 ownership 行（user + owner type）
    $shareholders = []; // key: "type_id" => {name, account_id, companies: []}
    if ($tableExists && $hasOwnerType) {
        $ownerships = $pdo->prepare("
            SELECT
                co.company_id,
                co.account_id,
                co.percentage,
                co.owner_type,
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
        $rows = $ownerships->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as $row) {
            $key   = $row['owner_type'] . '_' . $row['account_id'];
            $cId   = (int)$row['company_id'];
            $pct   = (float)$row['percentage'];
            $profit= $companyProfits[$cId] ?? 0;
            $earn  = round($profit * $pct / 100, 2);

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
                'company_name' => $this_name = (function() use ($companies, $cId) {
                    foreach ($companies as $c) {
                        if ((int)$c['id'] === $cId) return $c['name'];
                    }
                    return 'Unknown';
                })(),
                'pct'      => $pct,
                'profit'   => $profit,
                'earnings' => $earn
            ];
            $shareholders[$key]['total_earnings'] += $earn;
        }
    }

    // 按 total_earnings 降序排列
    $shareholderList = array_values($shareholders);
    usort($shareholderList, fn($a, $b) => $b['total_earnings'] <=> $a['total_earnings']);

    // Round total_earnings
    foreach ($shareholderList as &$sh) {
        $sh['total_earnings'] = round($sh['total_earnings'], 2);
    }
    unset($sh);

    // 5. 组装公司列表（含利润）
    $companyList = array_map(fn($c) => [
        'id'     => (int)$c['id'],
        'name'   => $c['name'],
        'profit' => $companyProfits[$c['id']] ?? 0
    ], $companies);

    echo json_encode([
        'status' => 'success',
        'data'   => [
            'group_id'     => $group_id,
            'date_from'    => $date_from,
            'date_to'      => $date_to,
            'companies'    => $companyList,
            'shareholders' => $shareholderList,
            'total_profit' => round($totalProfit, 2)
        ]
    ]);

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
