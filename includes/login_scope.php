<?php
/**
 * Resolve whether the login form identifier is a company code or a group id.
 *
 * Tenant modes (login_tenant_mode):
 *   auto    — active `groups.group_code` wins as group; else exact company_id → company
 *   group   — only group tenant (`groups` or group entity company_id)
 *   company — only exact company_id (subsidiary codes like C168, 95); not via group_id
 *
 * Group is independent (entity row company_id = group_code) while subsidiaries use
 * distinct company_id + group_id — Domain forbids same code for both in one owner.
 */
require_once __DIR__ . '/group_scope_resolve.php';
require_once __DIR__ . '/group_tenant_bootstrap.php';

function gc_normalize_login_tenant_mode(?string $mode): string
{
    $m = strtolower(trim((string) $mode));
    if ($m === 'group' || $m === 'company') {
        return $m;
    }
    return 'auto';
}

/**
 * @return array{scope: string, identifier: string}
 */
function resolve_login_identifier_scope(PDO $pdo, string $loginInput, string $tenantMode = 'auto'): array
{
    $id = strtoupper(trim($loginInput));
    $mode = gc_normalize_login_tenant_mode($tenantMode);
    if ($id === '') {
        return ['scope' => 'company', 'identifier' => ''];
    }

    $hasActiveGroupTenant = false;
    if (gc_has_groups_table($pdo)) {
        try {
            $gStmt = $pdo->prepare(
                "SELECT id FROM `groups` WHERE UPPER(TRIM(group_code)) = ? AND status = 'active' LIMIT 1"
            );
            $gStmt->execute([$id]);
            $hasActiveGroupTenant = (bool) $gStmt->fetchColumn();
        } catch (Throwable $e) {
            $hasActiveGroupTenant = false;
        }
    }

    $stmt = $pdo->prepare(
        "SELECT 1 FROM company WHERE UPPER(TRIM(company_id)) = ? AND TRIM(COALESCE(company_id, '')) <> '' LIMIT 1"
    );
    $stmt->execute([$id]);
    $hasExactCompanyCode = (bool) $stmt->fetchColumn();

    if ($mode === 'company') {
        return [
            'scope' => 'company',
            'identifier' => $hasExactCompanyCode ? $id : $id,
        ];
    }

    if ($mode === 'group') {
        if ($hasActiveGroupTenant || gc_resolve_legacy_group_entity_company_id($pdo, $id) > 0) {
            return ['scope' => 'group', 'identifier' => $id];
        }
        $stmt = $pdo->prepare(
            "SELECT 1 FROM company WHERE UPPER(TRIM(COALESCE(group_id, ''))) = ?
             AND TRIM(COALESCE(company_id, '')) <> '' AND UPPER(TRIM(company_id)) <> ? LIMIT 1"
        );
        $stmt->execute([$id, $id]);
        if ($stmt->fetchColumn()) {
            return ['scope' => 'group', 'identifier' => $id];
        }
        return ['scope' => 'company', 'identifier' => $id];
    }

    // auto: independent group tenant in `groups` takes precedence over subsidiary-only match
    if ($hasActiveGroupTenant) {
        return ['scope' => 'group', 'identifier' => $id];
    }

    if ($hasExactCompanyCode) {
        $entityId = gc_resolve_legacy_group_entity_company_id($pdo, $id);
        if ($entityId > 0) {
            $chk = $pdo->prepare(
                'SELECT 1 FROM company WHERE id = ? AND UPPER(TRIM(company_id)) = UPPER(TRIM(COALESCE(group_id, ""))) LIMIT 1'
            );
            $chk->execute([$entityId]);
            if ($chk->fetchColumn()) {
                return ['scope' => 'group', 'identifier' => $id];
            }
        }
        return ['scope' => 'company', 'identifier' => $id];
    }

    $stmt = $pdo->prepare('SELECT 1 FROM company WHERE UPPER(TRIM(COALESCE(group_id, ""))) = ? LIMIT 1');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn()) {
        return ['scope' => 'group', 'identifier' => $id];
    }

    return ['scope' => 'company', 'identifier' => $id];
}

/**
 * SQL fragment AND ( ... ) for company alias c.
 */
function gc_login_company_where_fragment(string $tenantMode): string
{
    $mode = gc_normalize_login_tenant_mode($tenantMode);
    if ($mode === 'company') {
        return '(UPPER(TRIM(c.company_id)) = ?)';
    }
    if ($mode === 'group') {
        return '(UPPER(TRIM(c.company_id)) = ? OR UPPER(TRIM(COALESCE(c.group_id, ""))) = ?)';
    }
    return '(UPPER(TRIM(c.company_id)) = ? OR UPPER(TRIM(COALESCE(c.group_id, ""))) = ?)';
}

/** @return array<int, string|int> */
function gc_login_company_where_params(string $loginInput, string $tenantMode): array
{
    $id = strtoupper(trim($loginInput));
    $mode = gc_normalize_login_tenant_mode($tenantMode);
    if ($mode === 'company') {
        return [$id];
    }
    return [$id, $id];
}

function gc_login_company_order_by(string $loginInput, string $tenantMode, array $resolved): string
{
    $id = strtoupper(trim($loginInput));
    $mode = gc_normalize_login_tenant_mode($tenantMode);
    $scope = $resolved['scope'] ?? 'company';

    if ($mode === 'company' || $scope === 'company') {
        return 'CASE WHEN UPPER(TRIM(c.company_id)) = ' . quote_login_sql_literal($id)
            . ' THEN 0 ELSE 1 END, c.id ASC';
    }

    return 'CASE WHEN UPPER(TRIM(c.company_id)) = ' . quote_login_sql_literal($id)
        . ' AND UPPER(TRIM(c.company_id)) = UPPER(TRIM(COALESCE(c.group_id, ""))) THEN 0 '
        . 'WHEN UPPER(TRIM(c.company_id)) = ' . quote_login_sql_literal($id) . ' THEN 1 '
        . 'WHEN UPPER(TRIM(COALESCE(c.group_id, ""))) = ' . quote_login_sql_literal($id) . ' THEN 2 '
        . 'ELSE 3 END, c.id ASC';
}

function quote_login_sql_literal(string $value): string
{
    return "'" . str_replace("'", "''", $value) . "'";
}

/**
 * Pick the best company row among login matches (after password validation list).
 *
 * @param array<int, array<string, mixed>> $rows
 */
function gc_pick_login_company_row(array $rows, string $loginInput, array $resolved): ?array
{
    if ($rows === []) {
        return null;
    }
    $id = strtoupper(trim($loginInput));
    $scope = strtolower((string) ($resolved['scope'] ?? 'company'));

    if ($scope === 'group') {
        foreach ($rows as $row) {
            $code = strtoupper(trim((string) ($row['company_code'] ?? $row['company_id'] ?? '')));
            $gid = strtoupper(trim((string) ($row['group_id'] ?? '')));
            if ($code === $id && $code === $gid) {
                return $row;
            }
        }
        foreach ($rows as $row) {
            $code = strtoupper(trim((string) ($row['company_code'] ?? $row['company_id'] ?? '')));
            if ($code === $id) {
                return $row;
            }
        }
        return $rows[0];
    }

    foreach ($rows as $row) {
        $code = strtoupper(trim((string) ($row['company_code'] ?? $row['company_id'] ?? '')));
        if ($code === $id) {
            return $row;
        }
    }
    return $rows[0];
}

/**
 * Align session company_id with login scope (group entity vs subsidiary company).
 */
function gc_finalize_login_session_company(PDO $pdo, string $loginInput, array $resolved): void
{
    $id = strtoupper(trim($loginInput));
    if ($id === '') {
        return;
    }

    if (($resolved['scope'] ?? '') === 'group') {
        $entityId = gc_resolve_legacy_group_entity_company_id($pdo, $id);
        if ($entityId > 0) {
            $_SESSION['company_id'] = $entityId;
            $stmt = $pdo->prepare('SELECT company_id FROM company WHERE id = ? LIMIT 1');
            $stmt->execute([$entityId]);
            $code = $stmt->fetchColumn();
            if ($code !== false && $code !== null) {
                $_SESSION['company_code'] = strtoupper(trim((string) $code));
            }
        }
        return;
    }

    $stmt = $pdo->prepare('SELECT id, company_id FROM company WHERE UPPER(TRIM(company_id)) = ? ORDER BY id ASC LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $_SESSION['company_id'] = (int) $row['id'];
        $_SESSION['company_code'] = strtoupper(trim((string) $row['company_id']));
    }
}

function persist_login_filter_scope(PDO $pdo, string $loginInput, string $tenantMode = 'auto'): array
{
    $resolved = resolve_login_identifier_scope($pdo, $loginInput, $tenantMode);
    $_SESSION['login_scope'] = $resolved['scope'];
    $_SESSION['login_identifier'] = $resolved['identifier'];
    $_SESSION['login_tenant_mode'] = gc_normalize_login_tenant_mode($tenantMode);
    unset($_SESSION['login_group_id']);
    unset($_SESSION['login_group_scope_id']);
    unset($_SESSION['accessible_group_ids']);

    if ($resolved['scope'] === 'group' && $resolved['identifier'] !== '') {
        $pk = gc_resolve_group_pk_by_code($pdo, $resolved['identifier']);
        $_SESSION['login_group_scope_id'] = $pk > 0 ? $pk : null;
    }

    if ($resolved['scope'] === 'company' && $resolved['identifier'] !== '') {
        $stmt = $pdo->prepare(
            'SELECT UPPER(TRIM(group_id)) AS group_id FROM company WHERE UPPER(company_id) = ? LIMIT 1'
        );
        $stmt->execute([$resolved['identifier']]);
        $gid = $stmt->fetchColumn();
        $_SESSION['login_group_id'] = ($gid !== false && $gid !== null && trim((string) $gid) !== '')
            ? strtoupper(trim((string) $gid))
            : '';
    }

    return $resolved;
}
