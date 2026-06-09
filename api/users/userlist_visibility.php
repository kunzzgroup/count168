<?php
/**
 * User list visibility helpers (included by toggle_status_api; mirrors userlist_api scope rules).
 */
require_once __DIR__ . '/../../includes/group_scope_resolve.php';

function userlist_visibility_table_exists(PDO $pdo, string $table): bool
{
    try {
        return $pdo->query('SHOW TABLES LIKE ' . $pdo->quote($table))->rowCount() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function userlist_visibility_ucm_has_scope_columns(PDO $pdo): bool
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    try {
        $cache = $pdo->query("SHOW COLUMNS FROM user_company_map LIKE 'scope_type'")->rowCount() > 0;
    } catch (Throwable $e) {
        $cache = false;
    }

    return $cache;
}

function userlist_visibility_normalize_group_id(?string $groupId): ?string
{
    $g = strtoupper(trim((string) $groupId));

    return $g !== '' ? $g : null;
}

/** @return list<int> */
function userlist_visibility_fetch_user_subsidiary_company_ids(PDO $pdo, int $userId): array
{
    if ($userId <= 0) {
        return [];
    }

    $ids = [];
    if (userlist_visibility_ucm_has_scope_columns($pdo)) {
        $stmt = $pdo->prepare("
            SELECT company_id
            FROM user_company_map
            WHERE user_id = ?
              AND scope_type = 'company'
            ORDER BY company_id ASC
        ");
        $stmt->execute([$userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $cid) {
            $id = (int) $cid;
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        return array_values(array_unique($ids));
    }

    if (!userlist_visibility_table_exists($pdo, 'user_group_map')) {
        $stmt = $pdo->prepare('SELECT company_id FROM user_company_map WHERE user_id = ? ORDER BY company_id ASC');
        $stmt->execute([$userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $cid) {
            $id = (int) $cid;
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        return array_values(array_unique($ids));
    }

    $stmt = $pdo->prepare('
        SELECT ucm.company_id
        FROM user_company_map ucm
        WHERE ucm.user_id = ?
          AND NOT EXISTS (
              SELECT 1 FROM user_group_map ugm WHERE ugm.user_id = ucm.user_id
          )
        ORDER BY ucm.company_id ASC
    ');
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $cid) {
        $id = (int) $cid;
        if ($id > 0) {
            $ids[] = $id;
        }
    }

    return array_values(array_unique($ids));
}

/** @return list<string> */
function userlist_visibility_fetch_user_group_codes(PDO $pdo, int $userId): array
{
    if ($userId <= 0) {
        return [];
    }
    $codes = [];
    if (userlist_visibility_table_exists($pdo, 'user_group_map') && gc_has_groups_table($pdo)) {
        try {
            $stmt = $pdo->prepare('
                SELECT UPPER(TRIM(g.group_code)) AS group_code
                FROM user_group_map ugm
                INNER JOIN `groups` g ON g.id = ugm.group_id
                WHERE ugm.user_id = ?
            ');
            $stmt->execute([$userId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $raw) {
                $g = userlist_visibility_normalize_group_id((string) $raw);
                if ($g !== null) {
                    $codes[$g] = true;
                }
            }
        } catch (Throwable $e) {
            // fall through
        }
    }
    if (userlist_visibility_ucm_has_scope_columns($pdo) && gc_has_groups_table($pdo)) {
        try {
            $stmt = $pdo->prepare("
                SELECT UPPER(TRIM(g.group_code)) AS group_code
                FROM user_company_map ucm
                INNER JOIN `groups` g ON g.id = ucm.scope_id
                WHERE ucm.user_id = ?
                  AND ucm.scope_type = 'group'
                  AND ucm.scope_id > 0
            ");
            $stmt->execute([$userId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $raw) {
                $g = userlist_visibility_normalize_group_id((string) $raw);
                if ($g !== null) {
                    $codes[$g] = true;
                }
            }
        } catch (Throwable $e) {
            // fall through
        }
    }

    return array_keys($codes);
}

/** @return list<int> */
function userlist_visibility_fetch_group_only_user_ids(PDO $pdo, string $groupScope): array
{
    $g = userlist_visibility_normalize_group_id($groupScope);
    if ($g === null) {
        return [];
    }

    $groupPk = gc_resolve_group_pk_by_code($pdo, $g);
    $ids = [];

    if (userlist_visibility_table_exists($pdo, 'user_group_map') && gc_has_groups_table($pdo)) {
        try {
            $stmt = $pdo->prepare('
                SELECT ugm.user_id
                FROM user_group_map ugm
                INNER JOIN `groups` grp ON grp.id = ugm.group_id
                WHERE UPPER(TRIM(grp.group_code)) = ?
            ');
            $stmt->execute([$g]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $uid) {
                $ids[(int) $uid] = true;
            }
        } catch (Throwable $e) {
            // fall through
        }
    }

    if ($groupPk > 0 && userlist_visibility_ucm_has_scope_columns($pdo)) {
        $stmt = $pdo->prepare("
            SELECT user_id FROM user_company_map
            WHERE scope_type = 'group' AND scope_id = ?
        ");
        $stmt->execute([$groupPk]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $uid) {
            $ids[(int) $uid] = true;
        }
    }

    $out = [];
    foreach (array_keys($ids) as $userId) {
        $userId = (int) $userId;
        if ($userId <= 0) {
            continue;
        }
        if (userlist_visibility_fetch_user_subsidiary_company_ids($pdo, $userId) !== []) {
            continue;
        }
        $out[] = $userId;
    }

    return $out;
}

/** @param list<int> $companyIds @return list<int> */
function userlist_visibility_fetch_company_scope_user_ids(PDO $pdo, array $companyIds): array
{
    $companyIds = array_values(array_unique(array_filter(array_map('intval', $companyIds), static fn (int $id): bool => $id > 0)));
    if ($companyIds === []) {
        return [];
    }

    $ids = [];
    $placeholders = implode(',', array_fill(0, count($companyIds), '?'));

    if (userlist_visibility_ucm_has_scope_columns($pdo)) {
        $stmt = $pdo->prepare("
            SELECT DISTINCT ucm.user_id
            FROM user_company_map ucm
            WHERE ucm.company_id IN ($placeholders)
              AND (
                  ucm.scope_type = 'company'
                  OR (
                      (ucm.scope_type IS NULL OR ucm.scope_type = '')
                      AND NOT EXISTS (
                          SELECT 1 FROM user_group_map ugm WHERE ugm.user_id = ucm.user_id
                      )
                  )
              )
              AND COALESCE(ucm.scope_type, '') != 'group'
        ");
        $stmt->execute($companyIds);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $uid) {
            $ids[(int) $uid] = true;
        }
    } else {
        $stmt = $pdo->prepare("
            SELECT DISTINCT ucm.user_id
            FROM user_company_map ucm
            WHERE ucm.company_id IN ($placeholders)
              AND NOT EXISTS (
                  SELECT 1 FROM user_group_map ugm WHERE ugm.user_id = ucm.user_id
              )
        ");
        $stmt->execute($companyIds);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $uid) {
            $ids[(int) $uid] = true;
        }
    }

    $out = array_values(array_filter(array_map('intval', array_keys($ids)), static fn (int $id): bool => $id > 0));
    if ($out === [] || !userlist_visibility_table_exists($pdo, 'user_group_map')) {
        return $out;
    }

    $companyIdSet = array_fill_keys($companyIds, true);
    $filtered = [];
    foreach ($out as $userId) {
        $stmt = $pdo->prepare('SELECT 1 FROM user_group_map WHERE user_id = ? LIMIT 1');
        $stmt->execute([$userId]);
        if (!(bool) $stmt->fetchColumn()) {
            $filtered[] = $userId;
            continue;
        }
        $subsidiaries = userlist_visibility_fetch_user_subsidiary_company_ids($pdo, $userId);
        foreach ($subsidiaries as $cid) {
            if (isset($companyIdSet[(int) $cid])) {
                $filtered[] = $userId;
                break;
            }
        }
    }

    return $filtered;
}

/** @param list<int> $userIds @param list<int> $filterCompanyIds @return list<int> */
function userlist_visibility_filter_users_for_group_subsidiary_view(PDO $pdo, array $userIds, string $groupScope, array $filterCompanyIds): array
{
    $g = userlist_visibility_normalize_group_id($groupScope);
    if ($g === null || $userIds === []) {
        return $userIds;
    }

    $companyIdSet = [];
    foreach ($filterCompanyIds as $cid) {
        $cid = (int) $cid;
        if ($cid > 0) {
            $companyIdSet[$cid] = true;
        }
    }
    if ($companyIdSet === []) {
        return $userIds;
    }

    $filtered = [];
    foreach ($userIds as $userId) {
        $userId = (int) $userId;
        if ($userId <= 0) {
            continue;
        }

        $groupCodes = userlist_visibility_fetch_user_group_codes($pdo, $userId);
        if ($groupCodes === []) {
            $filtered[] = $userId;
            continue;
        }

        if (!in_array($g, $groupCodes, true)) {
            continue;
        }

        $subsidiaries = userlist_visibility_fetch_user_subsidiary_company_ids($pdo, $userId);
        if ($subsidiaries === []) {
            continue;
        }

        foreach ($subsidiaries as $cid) {
            if (isset($companyIdSet[(int) $cid])) {
                $filtered[] = $userId;
                break;
            }
        }
    }

    return $filtered;
}

function userlist_visibility_user_allowed_for_request(PDO $pdo, int $userId, ?string $groupId, ?int $companyId, bool $groupOnly): bool
{
    if ($userId <= 0) {
        return false;
    }

    $g = userlist_visibility_normalize_group_id($groupId);
    if ($g !== null && $groupOnly) {
        return in_array($userId, userlist_visibility_fetch_group_only_user_ids($pdo, $g), true);
    }

    if ($companyId !== null && $companyId > 0) {
        if ($g !== null && !gc_session_can_access_company_id($pdo, $companyId, $g)) {
            return false;
        }
        $allowed = userlist_visibility_fetch_company_scope_user_ids($pdo, [$companyId]);
        if ($g !== null) {
            $allowed = userlist_visibility_filter_users_for_group_subsidiary_view($pdo, $allowed, $g, [$companyId]);
        }

        return in_array($userId, $allowed, true);
    }

    return false;
}
