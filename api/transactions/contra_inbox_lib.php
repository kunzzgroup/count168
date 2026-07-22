<?php
/**
 * Contra / Approval Inbox 共用逻辑（Manager+）
 */

require_once __DIR__ . '/../includes/money_decimal.php';

function contraInboxIsManagerOrAboveRole(string $role): bool
{
    return in_array(strtolower(trim($role)), ['manager', 'admin', 'owner'], true);
}

function contraInboxTableHasColumn(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    return $stmt->rowCount() > 0;
}

function contraInboxResolveCompanyId(PDO $pdo): int
{
    $userRole = strtolower($_SESSION['role'] ?? '');
    if (isset($_GET['company_id']) && $_GET['company_id'] !== '') {
        $rid = (int) $_GET['company_id'];
        if ($userRole === 'owner') {
            $oid = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare('SELECT id FROM company WHERE id = ? AND owner_id = ?');
            $stmt->execute([$rid, $oid]);
            if ($stmt->fetchColumn()) {
                return $rid;
            }
            throw new Exception('无权访问该公司');
        }
        if (isset($_SESSION['company_id']) && (int) $_SESSION['company_id'] === $rid) {
            return $rid;
        }
        throw new Exception('无权访问该公司');
    }
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }
    return (int) $_SESSION['company_id'];
}

function contraInboxPendingTypeSql(): string
{
    return "('CONTRA','PAYMENT','RECEIVE','CLAIM','CLEAR','ADJUSTMENT','PROFIT','WIN','LOSE')";
}

/**
 * 轻量签名：仅查 pending id，供长轮询每秒比对
 */
function contraInboxPendingSignature(PDO $pdo, int $companyId): string
{
    if (!contraInboxTableHasColumn($pdo, 'transactions', 'approval_status')) {
        return sha1('');
    }
    $sql = 'SELECT t.id FROM transactions t
            WHERE t.company_id = ?
              AND UPPER(TRIM(COALESCE(t.approval_status, \'\'))) = \'PENDING\'
              AND t.transaction_type IN ' . contraInboxPendingTypeSql() . '
            ORDER BY t.id ASC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId]);
    $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $ids = array_map('intval', $ids ?: []);
    return sha1(implode(',', $ids));
}

function contraInboxFetchPending(PDO $pdo, int $companyId): array
{
    $hasCurrencyId = contraInboxTableHasColumn($pdo, 'transactions', 'currency_id');
    $hasCreatedAt = contraInboxTableHasColumn($pdo, 'transactions', 'created_at');
    $sql = "SELECT t.id, DATE_FORMAT(t.transaction_date, '%d/%m/%Y') AS transaction_date, t.amount,
            COALESCE(t.description, '') AS description,
            to_acc.account_id AS to_account_code, to_acc.name AS to_account_name,
            from_acc.account_id AS from_account_code, from_acc.name AS from_account_name,
            COALESCE(u.login_id, o.owner_code, '-') AS submitted_by";
    $sql .= $hasCurrencyId ? ", UPPER(COALESCE(c.code, '')) AS currency" : ", '' AS currency";
    $sql .= ' FROM transactions t
            LEFT JOIN account to_acc ON t.account_id = to_acc.id
            LEFT JOIN account from_acc ON t.from_account_id = from_acc.id
            LEFT JOIN user u ON t.created_by = u.id
            LEFT JOIN owner o ON t.created_by_owner = o.id';
    if ($hasCurrencyId) {
        $sql .= ' LEFT JOIN currency c ON t.currency_id = c.id';
    }
    $orderBy = $hasCreatedAt
        ? ' ORDER BY t.transaction_date ASC, t.created_at ASC, t.id ASC'
        : ' ORDER BY t.transaction_date ASC, t.id ASC';
    $sql .= ' WHERE t.company_id = ? AND UPPER(TRIM(COALESCE(t.approval_status, \'\'))) = \'PENDING\'
              AND t.transaction_type IN ' . contraInboxPendingTypeSql()
        . $orderBy;
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static function ($r) {
        return [
            'id' => (int) $r['id'],
            'transaction_date' => $r['transaction_date'] ?? '',
            'from_account_code' => $r['from_account_code'] ?? null,
            'from_account_name' => $r['from_account_name'] ?? null,
            'to_account_code' => $r['to_account_code'] ?? null,
            'to_account_name' => $r['to_account_name'] ?? null,
            'currency' => $r['currency'] ?? '',
            'amount' => money_out($r['amount'] ?? '0'),
            'submitted_by' => $r['submitted_by'] ?? '-',
            'description' => $r['description'] ?? '',
        ];
    }, $rows);
}

function contraInboxSignatureFromItems(array $items): string
{
    $ids = [];
    foreach ($items as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $ids[] = $id;
        }
    }
    sort($ids, SORT_NUMERIC);
    return sha1(implode(',', $ids));
}
