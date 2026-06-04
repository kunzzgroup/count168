<?php
/**
 * Dual-tenant helpers: group ledger (groups.id) vs company subsidiary.
 */

declare(strict_types=1);

require_once __DIR__ . '/group_scope_resolve.php';

function tenant_table_has_scope_columns(PDO $pdo, string $table): bool
{
    static $cache = [];
    $key = spl_object_hash($pdo) . ':' . $table;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        $cache[$key] = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE 'scope_type'")->rowCount() > 0;
    } catch (Throwable $e) {
        $cache[$key] = false;
    }
    return $cache[$key];
}

/**
 * @return array{mode: 'group'|'company', group_pk: int, company_id: int, group_code: string}
 */
function tenant_resolve_currency_context(
    PDO $pdo,
    ?int $companyId,
    ?string $groupCode,
    bool $forceGroupLedger = false
): array {
    $groupCode = gc_normalize_group_code($groupCode ?? '');
    $companyId = (int) ($companyId ?? 0);

    if ($groupCode !== '' && $companyId <= 0) {
        $groupPk = gc_resolve_group_pk_by_code($pdo, $groupCode);
        if ($groupPk <= 0) {
            throw new Exception('无效的 group_id');
        }
        $legacyId = $forceGroupLedger ? 0 : gc_resolve_legacy_group_entity_company_id($pdo, $groupCode);
        if ($legacyId > 0) {
            return [
                'mode' => 'company',
                'group_pk' => $groupPk,
                'company_id' => $legacyId,
                'group_code' => $groupCode,
            ];
        }
        $anchorId = gc_resolve_group_anchor_company_id($pdo, $groupCode);
        if ($anchorId <= 0) {
            throw new Exception('缺少 company_id');
        }

        return [
            'mode' => 'group',
            'group_pk' => $groupPk,
            'company_id' => $anchorId,
            'group_code' => $groupCode,
        ];
    }

    if ($companyId <= 0) {
        throw new Exception('缺少公司信息');
    }

    return [
        'mode' => 'company',
        'group_pk' => $groupCode !== '' ? gc_resolve_group_pk_by_code($pdo, $groupCode) : 0,
        'company_id' => $companyId,
        'group_code' => $groupCode,
    ];
}

/**
 * @return array<int, string> currency id => uppercase code
 */
function tenant_load_group_tenant_currency_map(PDO $pdo, string $groupCode): array
{
    $g = gc_normalize_group_code($groupCode);
    if ($g === '') {
        return [];
    }
    $pk = gc_resolve_group_pk_by_code($pdo, $g);
    if ($pk <= 0) {
        return [];
    }

    $map = [];
    if (tenant_table_has_scope_columns($pdo, 'currency')) {
        $stmt = $pdo->prepare("
            SELECT id, UPPER(TRIM(code)) AS code
            FROM currency
            WHERE scope_type = 'group' AND scope_id = ?
            ORDER BY code ASC
        ");
        $stmt->execute([$pk]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $code = strtoupper(trim((string) ($row['code'] ?? '')));
            if ($code !== '') {
                $map[(int) $row['id']] = $code;
            }
        }
    }

    return $map;
}

/**
 * Create currency on group tenant (scope_type=group). company_id column keeps anchor subsidiary for NOT NULL FK.
 *
 * @return array{id: int, code: string}
 */
function tenant_create_currency(PDO $pdo, string $code, array $ctx): array
{
    $code = strtoupper(trim($code));
    if ($code === '') {
        throw new Exception('Currency code is required');
    }

    $companyId = (int) ($ctx['company_id'] ?? 0);
    if ($companyId <= 0) {
        throw new Exception('缺少公司信息');
    }

    $hasScope = tenant_table_has_scope_columns($pdo, 'currency');
    if (($ctx['mode'] ?? '') === 'group' && $hasScope) {
        $groupPk = (int) ($ctx['group_pk'] ?? 0);
        $stmt = $pdo->prepare("
            SELECT id FROM currency
            WHERE scope_type = 'group' AND scope_id = ? AND UPPER(TRIM(code)) = ?
            LIMIT 1
        ");
        $stmt->execute([$groupPk, $code]);
        $existing = (int) ($stmt->fetchColumn() ?: 0);
        if ($existing > 0) {
            throw new Exception('Currency ' . $code . ' already exists');
        }
        try {
            $stmt = $pdo->prepare("
                INSERT INTO currency (code, company_id, scope_type, scope_id)
                VALUES (?, ?, 'group', ?)
            ");
            $stmt->execute([$code, $companyId, $groupPk]);
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                throw new Exception('Currency ' . $code . ' already exists for this group');
            }
            throw $e;
        }
    } else {
        $stmt = $pdo->prepare('SELECT id FROM currency WHERE code = ? AND company_id = ?');
        $stmt->execute([$code, $companyId]);
        if ($stmt->fetchColumn()) {
            throw new Exception('Currency ' . $code . ' already exists');
        }
        $stmt = $pdo->prepare('INSERT INTO currency (code, company_id) VALUES (?, ?)');
        $stmt->execute([$code, $companyId]);
    }

    return ['id' => (int) $pdo->lastInsertId(), 'code' => $code];
}

/**
 * @return array<int, array{id: int, code: string}>
 */
function tenant_fetch_currencies(PDO $pdo, array $ctx): array
{
    $companyId = (int) ($ctx['company_id'] ?? 0);
    if ($companyId <= 0) {
        return [];
    }

    if (($ctx['mode'] ?? '') === 'group' && tenant_table_has_scope_columns($pdo, 'currency')) {
        $groupPk = (int) ($ctx['group_pk'] ?? 0);
        $stmt = $pdo->prepare("
            SELECT id, code FROM currency
            WHERE scope_type = 'group' AND scope_id = ?
            ORDER BY code ASC
        ");
        $stmt->execute([$groupPk]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT id, code FROM currency WHERE company_id = ?'
            . tenant_sql_currency_subsidiary_only($pdo)
            . ' ORDER BY code ASC'
        );
        $stmt->execute([$companyId]);
    }

    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $rows[] = [
            'id' => (int) $row['id'],
            'code' => strtoupper(trim((string) ($row['code'] ?? ''))),
        ];
    }

    return $rows;
}

/**
 * Resolve currency tenant from HTTP-style params (group_only / group_id / company_id).
 *
 * @param array<string, mixed> $params
 * @return array{mode: 'group'|'company', group_pk: int, company_id: int, group_code: string}
 */
function tenant_resolve_currency_context_from_request(PDO $pdo, array $params): array
{
    $groupCode = gc_normalize_group_code((string) ($params['group_id'] ?? $params['view_group'] ?? ''));
    $requestedRaw = $params['company_id'] ?? null;
    $requestedId = ($requestedRaw !== null && trim((string) $requestedRaw) !== '') ? (int) $requestedRaw : 0;
    $groupOnly = !empty($params['group_only'])
        && filter_var($params['group_only'], FILTER_VALIDATE_BOOLEAN);

    $forceGroupLedger = $groupOnly;
    // Group login defaults to group ledger only when no explicit subsidiary company_id was sent.
    if (
        !$forceGroupLedger
        && $requestedId <= 0
        && function_exists('gc_is_group_login')
        && gc_is_group_login()
    ) {
        $forceGroupLedger = true;
        if ($groupCode === '') {
            $groupCode = gc_normalize_group_code((string) ($_SESSION['login_identifier'] ?? ''));
        }
    }

    if ($groupCode !== '' && ($requestedId <= 0 || $groupOnly || $forceGroupLedger)) {
        return tenant_resolve_currency_context($pdo, null, $groupCode, $forceGroupLedger);
    }
    if ($requestedId > 0) {
        return tenant_resolve_currency_context(
            $pdo,
            $requestedId,
            $groupCode !== '' ? $groupCode : null,
            false
        );
    }
    if ($groupCode !== '') {
        return tenant_resolve_currency_context($pdo, null, $groupCode, $forceGroupLedger);
    }

    $sessionId = (int) ($params['session_company_id'] ?? 0);
    if ($sessionId <= 0) {
        throw new Exception('缺少公司信息');
    }

    return tenant_resolve_currency_context($pdo, $sessionId, null, false);
}

/** Group-login Account page: always group ledger, never subsidiary company scope. */
function tenant_account_api_force_group_ledger(): bool
{
    return function_exists('gc_is_group_login') && gc_is_group_login();
}

/** SQL AND: subsidiary currency rows only (exclude group ledger rows sharing anchor company_id). */
function tenant_sql_currency_subsidiary_only(PDO $pdo, string $alias = ''): string
{
    if (!tenant_table_has_scope_columns($pdo, 'currency')) {
        return '';
    }
    $col = $alias !== '' ? "{$alias}.scope_type" : 'scope_type';

    return " AND ({$col} IS NULL OR TRIM({$col}) = '' OR {$col} = 'company')";
}

function tenant_currency_belongs_to_context(PDO $pdo, int $currencyId, array $ctx): bool
{
    if ($currencyId <= 0) {
        return false;
    }
    if (($ctx['mode'] ?? '') === 'group' && tenant_table_has_scope_columns($pdo, 'currency')) {
        $stmt = $pdo->prepare("
            SELECT id FROM currency
            WHERE id = ? AND scope_type = 'group' AND scope_id = ?
            LIMIT 1
        ");
        $stmt->execute([$currencyId, (int) ($ctx['group_pk'] ?? 0)]);

        return (bool) $stmt->fetchColumn();
    }
    $companyId = (int) ($ctx['company_id'] ?? 0);
    if ($companyId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare(
        'SELECT id FROM currency WHERE id = ? AND company_id = ?'
        . tenant_sql_currency_subsidiary_only($pdo)
        . ' LIMIT 1'
    );
    $stmt->execute([$currencyId, $companyId]);

    return (bool) $stmt->fetchColumn();
}

/**
 * @return list<int>
 */
function tenant_collect_group_account_ids(PDO $pdo, int $groupPk): array
{
    if ($groupPk <= 0) {
        return [];
    }
    $ids = [];
    if (tenant_table_has_scope_columns($pdo, 'account_company')) {
        $stmt = $pdo->prepare("
            SELECT DISTINCT account_id FROM account_company
            WHERE scope_type = 'group' AND scope_id = ?
        ");
        $stmt->execute([$groupPk]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $ids[(int) $id] = true;
        }
    }
    try {
        if ($pdo->query("SHOW TABLES LIKE 'account_group_map'")->rowCount() > 0) {
            $stmt = $pdo->prepare('SELECT DISTINCT account_id FROM account_group_map WHERE group_id = ?');
            $stmt->execute([$groupPk]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
                $ids[(int) $id] = true;
            }
        }
    } catch (Throwable $e) {
        // ignore
    }

    return array_values(array_filter(array_map('intval', array_keys($ids)), static fn (int $id): bool => $id > 0));
}

function tenant_account_belongs_to_context(PDO $pdo, int $accountId, array $ctx): bool
{
    if ($accountId <= 0) {
        return false;
    }
    if (($ctx['mode'] ?? '') === 'group') {
        return in_array($accountId, tenant_collect_group_account_ids($pdo, (int) ($ctx['group_pk'] ?? 0)), true);
    }
    $companyId = (int) ($ctx['company_id'] ?? 0);
    if ($companyId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare('
        SELECT a.id FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE a.id = ? AND ac.company_id = ?'
        . tenant_sql_account_company_subsidiary_only($pdo, 'ac')
        . ' LIMIT 1
    ');
    $stmt->execute([$accountId, $companyId]);

    return (bool) $stmt->fetchColumn();
}

/**
 * SQL AND fragment: subsidiary company membership only (exclude group ledger rows that reuse anchor company_id).
 */
function tenant_sql_account_company_subsidiary_only(PDO $pdo, string $alias = 'ac'): string
{
    if (!tenant_table_has_scope_columns($pdo, 'account_company')) {
        return '';
    }

    return " AND ({$alias}.scope_type IS NULL OR TRIM({$alias}.scope_type) = '' OR {$alias}.scope_type = 'company')";
}

function tenant_link_account_group_scope(PDO $pdo, int $accountId, int $groupPk, int $anchorCompanyId): void
{
    if ($groupPk <= 0 || $anchorCompanyId <= 0) {
        throw new Exception('无效的集团范围');
    }
    if (!tenant_table_has_scope_columns($pdo, 'account_company')) {
        $stmt = $pdo->prepare('INSERT INTO account_company (account_id, company_id) VALUES (?, ?)');
        $stmt->execute([$accountId, $anchorCompanyId]);
        return;
    }

    $stmt = $pdo->prepare('
        SELECT id FROM account_company
        WHERE account_id = ? AND scope_type = ? AND scope_id = ?
        LIMIT 1
    ');
    $stmt->execute([$accountId, 'group', $groupPk]);
    if ($stmt->fetchColumn()) {
        return;
    }

    $stmt = $pdo->prepare('
        INSERT INTO account_company (account_id, company_id, scope_type, scope_id)
        VALUES (?, ?, ?, ?)
    ');
    $stmt->execute([$accountId, $anchorCompanyId, 'group', $groupPk]);
}
