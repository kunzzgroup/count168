<?php
/**
 * Group vs Company login scope — shared server-side access rules.
 *
 * Session keys (set on login via login_scope.php):
 *   login_scope      — "group" | "company"
 *   login_identifier — uppercased group id or company code from the login form
 *   login_group_id   — native group_id of the login company (UI default; not a visibility fence)
 *
 * Group login: group-only mode + companies in that group only.
 * Company login: all companies/groups the owner already has (AP+IG when linked);
 *                 no group-only aggregate; may switch companies across linked groups.
 */

declare(strict_types=1);

const GC_LOGIN_SCOPE_GROUP = 'group';
const GC_LOGIN_SCOPE_COMPANY = 'company';

function gc_normalize_scope(?string $scope): ?string
{
    $s = strtolower(trim((string) $scope));
    if ($s === GC_LOGIN_SCOPE_GROUP || $s === GC_LOGIN_SCOPE_COMPANY) {
        return $s;
    }
    return null;
}

function gc_session_login_scope(): ?string
{
    return gc_normalize_scope($_SESSION['login_scope'] ?? null);
}

function gc_session_login_identifier(): ?string
{
    $id = trim((string) ($_SESSION['login_identifier'] ?? ''));
    return $id !== '' ? strtoupper($id) : null;
}

/** Cache native group_id for company login (default group filter on boot). */
function gc_hydrate_company_login_group_id(PDO $pdo): void
{
    if (!gc_is_company_login() || array_key_exists('login_group_id', $_SESSION)) {
        return;
    }

    $ident = gc_session_login_identifier();
    if ($ident === null) {
        $_SESSION['login_group_id'] = '';
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT UPPER(TRIM(group_id)) AS group_id FROM company WHERE UPPER(company_id) = ? LIMIT 1'
    );
    $stmt->execute([$ident]);
    $gid = $stmt->fetchColumn();
    $_SESSION['login_group_id'] = ($gid !== false && $gid !== null && trim((string) $gid) !== '')
        ? strtoupper(trim((string) $gid))
        : '';
}

/** Native group of the login company (default tab); null if none. */
function gc_session_login_group_id(): ?string
{
    if (!gc_is_company_login() || !array_key_exists('login_group_id', $_SESSION)) {
        return null;
    }
    $g = strtoupper(trim((string) $_SESSION['login_group_id']));
    return $g !== '' ? $g : null;
}

function gc_is_group_login(): bool
{
    return gc_session_login_scope() === GC_LOGIN_SCOPE_GROUP;
}

function gc_is_company_login(): bool
{
    return gc_session_login_scope() === GC_LOGIN_SCOPE_COMPANY;
}

/**
 * @param array<string, mixed> $companyRow expects company_id, group_id keys
 */
function gc_company_row_matches_login_scope(array $companyRow): bool
{
    $scope = gc_session_login_scope();
    $ident = gc_session_login_identifier();
    if ($scope === null || $ident === null) {
        return true;
    }

    if ($scope === GC_LOGIN_SCOPE_COMPANY) {
        // Owner/access list from get_companies_helper already scopes rows (incl. AP↔IG links).
        return true;
    }

    $gid = strtoupper(trim((string) ($companyRow['group_id'] ?? '')));
    return $gid === $ident;
}

/**
 * Filter company list for login scope. Company login: no extra filter.
 *
 * @param array<int, array<string, mixed>> $companies
 * @return array<int, array<string, mixed>>
 */
function gc_filter_companies_for_login_scope(array $companies): array
{
    if (gc_is_company_login() || gc_session_login_scope() === null) {
        return $companies;
    }

    return array_values(array_filter($companies, 'gc_company_row_matches_login_scope'));
}

/**
 * Company login: access is enforced by getUserCompanies / owner map (incl. linked groups).
 */
function gc_assert_company_id_allowed_for_login_scope(PDO $pdo, int $numericCompanyId): void
{
    if (!gc_is_company_login()) {
        return;
    }
    // update_company_session_api already validates against the user's company list.
}

/** Block company-login callers from group-only APIs. */
function gc_assert_group_only_operation_allowed(): void
{
    if (gc_is_group_login()) {
        return;
    }
    throw new RuntimeException('Group-only operation is not allowed for company login');
}

/** Numeric company ids allowed for aggregation under current scope. */
function gc_resolve_allowed_company_numeric_ids(PDO $pdo, array $accessibleCompanies): array
{
    $ids = [];
    foreach ($accessibleCompanies as $c) {
        if (!gc_company_row_matches_login_scope($c)) {
            continue;
        }
        $id = isset($c['id']) ? (int) $c['id'] : 0;
        if ($id > 0) {
            $ids[] = $id;
        }
    }
    return array_values(array_unique($ids));
}

/**
 * Group ids for filter pills when AP↔IG (etc.) are linked via group_ownership.
 *
 * @return list<string>
 */
function gc_session_accessible_group_ids(): array
{
    if (!isset($_SESSION['accessible_group_ids']) || !is_array($_SESSION['accessible_group_ids'])) {
        return [];
    }
    $out = [];
    foreach ($_SESSION['accessible_group_ids'] as $g) {
        $g = strtoupper(trim((string) $g));
        if ($g !== '') {
            $out[] = $g;
        }
    }
    sort($out);
    return array_values(array_unique($out));
}

/**
 * @param array<int, array<string, mixed>> $companies
 */
function gc_hydrate_accessible_group_ids(PDO $pdo, array $companies): void
{
    if (!gc_is_company_login()) {
        return;
    }
    if (isset($_SESSION['accessible_group_ids']) && is_array($_SESSION['accessible_group_ids'])) {
        return;
    }

    $groups = [];
    foreach ($companies as $c) {
        $g = strtoupper(trim((string) ($c['group_id'] ?? '')));
        if ($g !== '') {
            $groups[$g] = true;
        }
        $src = strtoupper(trim((string) ($c['link_source_group'] ?? '')));
        if ($src !== '') {
            $groups[$src] = true;
        }
    }

    $loginGroup = gc_session_login_group_id();
    if ($loginGroup !== null) {
        $groups[$loginGroup] = true;
    }

    $ownerIds = gc_resolve_owner_ids_for_group_links($pdo, $companies);
    if (!empty($ownerIds)) {
        foreach (gc_fetch_linked_group_id_pairs($pdo, $ownerIds) as $pair) {
            $groups[$pair['source']] = true;
            $groups[$pair['target']] = true;
        }
    }

    $_SESSION['accessible_group_ids'] = array_keys($groups);
    sort($_SESSION['accessible_group_ids']);
}

/**
 * @param array<int, array<string, mixed>> $companies
 * @return list<int>
 */
function gc_resolve_owner_ids_for_group_links(PDO $pdo, array $companies): array
{
    $ownerIds = [];

    if (strtolower((string) ($_SESSION['role'] ?? '')) === 'owner') {
        $oid = (int) ($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id'] ?? 0);
        if ($oid > 0) {
            $ownerIds[] = $oid;
        }
    }

    $ident = gc_session_login_identifier();
    if ($ident !== null) {
        $stmt = $pdo->prepare('SELECT owner_id FROM company WHERE UPPER(company_id) = ? LIMIT 1');
        $stmt->execute([$ident]);
        $oid = $stmt->fetchColumn();
        if ($oid) {
            $ownerIds[] = (int) $oid;
        }
    }

    foreach ($companies as $c) {
        if (!empty($c['owner_id'])) {
            $ownerIds[] = (int) $c['owner_id'];
        }
    }

    return array_values(array_unique(array_filter($ownerIds)));
}

/**
 * @param list<int> $ownerIds
 * @return list<array{source: string, target: string}>
 */
function gc_fetch_linked_group_id_pairs(PDO $pdo, array $ownerIds): array
{
    $ownerIds = array_values(array_unique(array_filter(array_map('intval', $ownerIds))));
    if (empty($ownerIds)) {
        return [];
    }

    try {
        if ($pdo->query("SHOW TABLES LIKE 'group_ownership'")->rowCount() === 0) {
            return [];
        }
    } catch (Exception $e) {
        return [];
    }

    $in = str_repeat('?,', count($ownerIds) - 1) . '?';
    $params = array_merge($ownerIds, $ownerIds);
    $stmt = $pdo->prepare("
        SELECT DISTINCT
            UPPER(TRIM(group_id)) AS source_group,
            UPPER(TRIM(partner_group_id)) AS target_group
        FROM group_ownership
        WHERE owner_type = 'group'
          AND percentage > 0
          AND partner_group_id IS NOT NULL
          AND TRIM(partner_group_id) <> ''
          AND owner_id IN ($in)

        UNION

        SELECT DISTINCT
            UPPER(TRIM(group_id)) AS source_group,
            UPPER(TRIM(partner_group_id)) AS target_group
        FROM group_ownership
        WHERE owner_type = 'owner'
          AND percentage > 0
          AND partner_group_id IS NOT NULL
          AND TRIM(partner_group_id) <> ''
          AND account_id IN ($in)
    ");
    $stmt->execute($params);

    $pairs = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $src = strtoupper(trim((string) ($row['source_group'] ?? '')));
        $tgt = strtoupper(trim((string) ($row['target_group'] ?? '')));
        if ($src === '' || $tgt === '') {
            continue;
        }
        $pairs[] = ['source' => $src, 'target' => $tgt];
    }

    return $pairs;
}
