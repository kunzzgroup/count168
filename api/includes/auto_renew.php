<?php
/**
 * Auto renew subscription helpers.
 * Ensures company columns exist; shared by auto_renew_api.php.
 */

require_once __DIR__ . '/../c168/c168_domain_access.php';

const AUTO_RENEW_VALID_PERIODS = ['7days', '1month', '3months', '6months', '1year'];

function auto_renew_ensure_columns(PDO $pdo): void
{
    $columns = [
        'auto_renew_enabled' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'auto_renew_period' => 'VARCHAR(20) NULL DEFAULT NULL',
        'payment_customer_id' => 'VARCHAR(255) NULL DEFAULT NULL',
        'payment_subscription_id' => 'VARCHAR(255) NULL DEFAULT NULL',
        'auto_renew_updated_at' => 'DATETIME NULL DEFAULT NULL',
        'auto_renew_updated_by' => 'VARCHAR(50) NULL DEFAULT NULL',
    ];

    foreach ($columns as $name => $definition) {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM company LIKE ?');
        $stmt->execute([$name]);
        if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE company ADD COLUMN `$name` $definition");
        }
    }
}

function auto_renew_is_valid_period(?string $period): bool
{
    if ($period === null || $period === '') {
        return false;
    }
    return in_array($period, AUTO_RENEW_VALID_PERIODS, true);
}

function auto_renew_normalize_period(?string $period): ?string
{
    $period = trim((string) ($period ?? ''));
    return auto_renew_is_valid_period($period) ? $period : null;
}

function auto_renew_calculate_next_expiration(string $period, ?string $baseDate): ?string
{
    if (!auto_renew_is_valid_period($period)) {
        return null;
    }

    $base = $baseDate ? strtotime((string) $baseDate) : false;
    if ($base === false) {
        $base = strtotime(date('Y-m-d'));
    }
    if ($base === false) {
        return null;
    }

    $dt = new DateTime('@' . $base);
    $dt->setTimezone(new DateTimeZone(date_default_timezone_get()));
    $dt->setTime(0, 0, 0);

    switch ($period) {
        case '7days':
            $dt->modify('+7 days');
            break;
        case '1month':
            $dt->modify('+1 month');
            break;
        case '3months':
            $dt->modify('+3 months');
            break;
        case '6months':
            $dt->modify('+6 months');
            break;
        case '1year':
            $dt->modify('+1 year');
            break;
        default:
            return null;
    }

    return $dt->format('Y-m-d');
}

function auto_renew_days_until(?string $expirationDate): ?int
{
    if ($expirationDate === null || trim((string) $expirationDate) === '') {
        return null;
    }
    $expTs = strtotime((string) $expirationDate);
    if ($expTs === false) {
        return null;
    }
    $today = strtotime(date('Y-m-d'));
    return (int) floor(($expTs - $today) / 86400);
}

function auto_renew_expiration_status(?int $daysLeft): string
{
    if ($daysLeft === null) {
        return 'normal';
    }
    if ($daysLeft < 0) {
        return 'expired';
    }
    if ($daysLeft <= 7) {
        return 'warning';
    }
    return 'normal';
}

function auto_renew_can_edit(array $session, ?PDO $pdo = null): bool
{
    $userType = strtolower(trim((string) ($session['user_type'] ?? '')));
    $role = strtolower(trim((string) ($session['role'] ?? '')));
    if ($userType === 'member') {
        return false;
    }
    if ((int) ($session['read_only'] ?? 0) === 1) {
        return false;
    }
    if ($pdo instanceof PDO) {
        return userHasC168AutoRenewAccess($pdo, $role, $userType);
    }
    return in_array($role, c168AutoRenewAllowedRoles(), true);
}

function auto_renew_page_access(PDO $pdo, array $session): bool
{
    $role = strtolower(trim((string) ($session['role'] ?? '')));
    $userType = strtolower(trim((string) ($session['user_type'] ?? '')));
    return userHasC168AutoRenewAccess($pdo, $role, $userType);
}

function auto_renew_list_client_companies(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT id, company_id, expiration_date, auto_renew_enabled, auto_renew_period,
               auto_renew_updated_at, auto_renew_updated_by
        FROM company
        WHERE UPPER(company_id) <> 'C168'
        ORDER BY company_id ASC
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $list = [];
    foreach ($rows as $row) {
        $list[] = array_merge(
            auto_renew_format_row($row),
            ['company_numeric_id' => (int) ($row['id'] ?? 0)]
        );
    }
    return $list;
}

function auto_renew_resolve_target_company_id(PDO $pdo, array $input, array $session): ?int
{
    $targetId = isset($input['target_company_id']) ? (int) $input['target_company_id'] : 0;
    if ($targetId <= 0) {
        return null;
    }
    $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND UPPER(company_id) <> 'C168' LIMIT 1");
    $stmt->execute([$targetId]);
    $found = $stmt->fetchColumn();
    return $found ? (int) $found : null;
}

function auto_renew_is_c168(?string $companyCode): bool
{
    return strtoupper(trim((string) $companyCode)) === 'C168';
}

function auto_renew_format_row(array $row): array
{
    $expirationDate = !empty($row['expiration_date']) ? (string) $row['expiration_date'] : null;
    $daysLeft = auto_renew_days_until($expirationDate);
    $enabled = (int) ($row['auto_renew_enabled'] ?? 0) === 1;
    $period = auto_renew_normalize_period($row['auto_renew_period'] ?? null);

    return [
        'company_code' => (string) ($row['company_id'] ?? ''),
        'expiration_date' => $expirationDate,
        'days_until_expiration' => $daysLeft,
        'expiration_status' => auto_renew_expiration_status($daysLeft),
        'auto_renew_enabled' => $enabled,
        'auto_renew_period' => $period,
        'preview_next_expiration' => ($enabled && $period && $expirationDate)
            ? auto_renew_calculate_next_expiration($period, $expirationDate)
            : null,
        'auto_renew_updated_at' => $row['auto_renew_updated_at'] ?? null,
        'auto_renew_updated_by' => $row['auto_renew_updated_by'] ?? null,
        'has_payment_gateway' => !empty($row['payment_subscription_id']),
    ];
}
