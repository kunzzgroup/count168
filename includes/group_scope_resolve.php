<?php
/**
 * Resolve group tenants from `groups` + group_company_map (Domain stores groups separately from company).
 */

declare(strict_types=1);

function gc_has_groups_table(PDO $pdo): bool
{
    static $cache = [];
    $key = spl_object_hash($pdo);
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        $cache[$key] = $pdo->query("SHOW TABLES LIKE 'groups'")->rowCount() > 0;
    } catch (Throwable $e) {
        $cache[$key] = false;
    }
    return $cache[$key];
}

function gc_normalize_group_code(?string $code): string
{
    return strtoupper(trim((string) $code));
}

/**
 * Numeric PK from groups.group_code.
 */
function gc_resolve_group_pk_by_code(PDO $pdo, string $groupCode): int
{
    $g = gc_normalize_group_code($groupCode);
    if ($g === '' || !gc_has_groups_table($pdo)) {
        return 0;
    }
    try {
        $stmt = $pdo->prepare('SELECT id FROM `groups` WHERE UPPER(TRIM(group_code)) = ? LIMIT 1');
        $stmt->execute([$g]);
        return (int) ($stmt->fetchColumn() ?: 0);
    } catch (Throwable $e) {
        return 0;
    }
}

/**
 * Legacy group-entity row on company (company_id = code or empty company_id + group_id).
 */
function gc_resolve_legacy_group_entity_company_id(PDO $pdo, string $groupCode): int
{
    $g = gc_normalize_group_code($groupCode);
    if ($g === '') {
        return 0;
    }

    $stmt = $pdo->prepare('
        SELECT id
        FROM company
        WHERE UPPER(TRIM(company_id)) = ?
        ORDER BY id ASC
        LIMIT 1
    ');
    $stmt->execute([$g]);
    $id = (int) ($stmt->fetchColumn() ?: 0);
    if ($id > 0) {
        return $id;
    }

    $placeholderStmt = $pdo->prepare("
        SELECT id
        FROM company
        WHERE TRIM(COALESCE(company_id, '')) = ''
          AND UPPER(TRIM(group_id)) = ?
        ORDER BY id ASC
        LIMIT 1
    ");
    $placeholderStmt->execute([$g]);

    return (int) ($placeholderStmt->fetchColumn() ?: 0);
}

/**
 * Subsidiary company.id rows under a group (group_company_map + company.group_id).
 *
 * @return int[]
 */
function gc_company_numeric_ids_for_group_code(PDO $pdo, string $groupCode): array
{
    $g = gc_normalize_group_code($groupCode);
    if ($g === '') {
        return [];
    }

    $ids = [];

    $stmt = $pdo->prepare("
        SELECT id
        FROM company
        WHERE UPPER(TRIM(COALESCE(group_id, ''))) = ?
          AND company_id IS NOT NULL
          AND TRIM(company_id) <> ''
          AND UPPER(TRIM(company_id)) <> ?
        ORDER BY company_id ASC
    ");
    $stmt->execute([$g, $g]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $n = (int) $id;
        if ($n > 0) {
            $ids[$n] = true;
        }
    }

    if (gc_has_groups_table($pdo)) {
        try {
            $mapStmt = $pdo->prepare("
                SELECT c.id
                FROM group_company_map gcm
                INNER JOIN `groups` g ON g.id = gcm.group_id
                INNER JOIN company c ON c.id = gcm.company_id
                WHERE UPPER(TRIM(g.group_code)) = ?
                  AND c.company_id IS NOT NULL
                  AND TRIM(c.company_id) <> ''
                ORDER BY c.company_id ASC
            ");
            $mapStmt->execute([$g]);
            foreach ($mapStmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
                $n = (int) $id;
                if ($n > 0) {
                    $ids[$n] = true;
                }
            }
        } catch (Throwable $e) {
            // ignore
        }
    }

    $out = array_keys($ids);
    sort($out);

    return $out;
}

/**
 * Company row used as API anchor when a numeric company_id is required (reports, currencies).
 * Prefer legacy entity row; else first subsidiary under the group.
 */
function gc_resolve_group_anchor_company_id(PDO $pdo, string $groupCode): int
{
    $legacy = gc_resolve_legacy_group_entity_company_id($pdo, $groupCode);
    if ($legacy > 0) {
        return $legacy;
    }

    $subs = gc_company_numeric_ids_for_group_code($pdo, $groupCode);
    if ($subs !== []) {
        return (int) $subs[0];
    }

    return 0;
}

