<?php
/**
 * Bootstrap group tenants: entity company rows (company_id = group_code),
 * account_company scope_type=group, tenant_module_policy, user_group_map.
 */
declare(strict_types=1);

require_once __DIR__ . '/group_scope_resolve.php';

function gc_table_has_columns(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = spl_object_hash($pdo) . ':' . $table . ':' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        $stmt = $pdo->prepare(
            'SELECT 1 FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
             LIMIT 1'
        );
        $stmt->execute([$table, $column]);
        $cache[$key] = (bool) $stmt->fetchColumn();
    } catch (Throwable $e) {
        $cache[$key] = false;
    }
    return $cache[$key];
}

/**
 * Resolve groups.id for a company row that is a group entity (company_id = group_code).
 */
function gc_group_pk_for_company_row(PDO $pdo, int $companyPk): int
{
    if ($companyPk <= 0 || !gc_has_groups_table($pdo)) {
        return 0;
    }
    try {
        $stmt = $pdo->prepare("
            SELECT g.id
            FROM company c
            INNER JOIN `groups` g
              ON g.owner_id = c.owner_id
             AND UPPER(TRIM(g.group_code)) = UPPER(TRIM(c.company_id))
            WHERE c.id = ?
            LIMIT 1
        ");
        $stmt->execute([$companyPk]);
        return (int) ($stmt->fetchColumn() ?: 0);
    } catch (Throwable $e) {
        return 0;
    }
}

/**
 * Ensure company row company_id = groups.group_code for one group.
 */
function gc_ensure_group_entity_company_for_group_pk(
    PDO $pdo,
    int $groupPk,
    string $createdBy = 'system'
): int {
    if ($groupPk <= 0 || !gc_has_groups_table($pdo)) {
        return 0;
    }

    $stmt = $pdo->prepare('
        SELECT id, group_code, owner_id, expiration_date, permissions
        FROM `groups`
        WHERE id = ?
        LIMIT 1
    ');
    $stmt->execute([$groupPk]);
    $g = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$g) {
        return 0;
    }

    $code = gc_normalize_group_code((string) ($g['group_code'] ?? ''));
    $ownerId = (int) ($g['owner_id'] ?? 0);
    if ($code === '' || $ownerId <= 0) {
        return 0;
    }

    $ownStmt = $pdo->prepare('
        SELECT id FROM company
        WHERE owner_id = ? AND UPPER(TRIM(company_id)) = ?
        LIMIT 1
    ');
    $ownStmt->execute([$ownerId, $code]);
    $existing = (int) ($ownStmt->fetchColumn() ?: 0);
    if ($existing > 0) {
        $upd = $pdo->prepare("
            UPDATE company
            SET group_id = ?,
                expiration_date = COALESCE(?, expiration_date),
                permissions = COALESCE(?, permissions)
            WHERE id = ?
        ");
        $upd->execute([
            $code,
            $g['expiration_date'] ?? null,
            $g['permissions'] ?? null,
            $existing,
        ]);
        return $existing;
    }

    $globalPk = gc_resolve_legacy_group_entity_company_id($pdo, $code);
    if ($globalPk > 0) {
        error_log(sprintf(
            'gc_ensure_group_entity_company: skip group %s (owner %d); company_id already used by company pk %d',
            $code,
            $ownerId,
            $globalPk
        ));
        return 0;
    }

    try {
        $ins = $pdo->prepare("
            INSERT INTO company (company_id, owner_id, created_by, group_id, expiration_date, permissions)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $ins->execute([
            $code,
            $ownerId,
            $createdBy,
            $code,
            $g['expiration_date'] ?? null,
            $g['permissions'] ?? null,
        ]);
        return (int) $pdo->lastInsertId();
    } catch (PDOException $e) {
        if ((string) $e->getCode() !== '23000') {
            throw $e;
        }
        return gc_resolve_legacy_group_entity_company_id($pdo, $code);
    }
}

/**
 * Link account to company; set scope_type=group when company is a group entity.
 */
function gc_link_account_to_companies(PDO $pdo, int $accountId, array $companyIds): void
{
    if ($accountId <= 0 || $companyIds === []) {
        return;
    }

    $hasScope = gc_table_has_columns($pdo, 'account_company', 'scope_type');

    if ($hasScope) {
        $stmt = $pdo->prepare("
            INSERT INTO account_company (account_id, company_id, scope_type, scope_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                scope_type = VALUES(scope_type),
                scope_id = VALUES(scope_id),
                updated_at = CURRENT_TIMESTAMP
        ");
    } else {
        $stmt = $pdo->prepare('INSERT INTO account_company (account_id, company_id) VALUES (?, ?)');
    }

    foreach ($companyIds as $compId) {
        $compId = (int) $compId;
        if ($compId <= 0) {
            continue;
        }
        try {
            if ($hasScope) {
                $groupPk = gc_group_pk_for_company_row($pdo, $compId);
                if ($groupPk > 0) {
                    $stmt->execute([$accountId, $compId, 'group', $groupPk]);
                } else {
                    $stmt->execute([$accountId, $compId, 'company', $compId]);
                }
            } else {
                $stmt->execute([$accountId, $compId]);
            }
        } catch (PDOException $e) {
            if ((string) $e->getCode() !== '23000') {
                error_log('gc_link_account_to_companies: ' . $e->getMessage());
                throw $e;
            }
        }
    }
}

function gc_sync_tenant_module_policy_for_group(PDO $pdo, int $groupPk): void
{
    if ($groupPk <= 0 || !gc_table_has_columns($pdo, 'tenant_module_policy', 'scope_type')) {
        return;
    }

    $stmt = $pdo->prepare('SELECT permissions FROM `groups` WHERE id = ? LIMIT 1');
    $stmt->execute([$groupPk]);
    $permsJson = $stmt->fetchColumn();
    $enabled = 0;
    if ($permsJson !== false && $permsJson !== null && trim((string) $permsJson) !== '') {
        $decoded = json_decode((string) $permsJson, true);
        if (is_array($decoded) && $decoded !== []) {
            $enabled = 1;
        }
    }

    $mods = ['process', 'bankprocess'];
    $ins = $pdo->prepare("
        INSERT INTO tenant_module_policy (scope_type, scope_id, module_key, is_enabled)
        VALUES ('group', ?, ?, ?)
        ON DUPLICATE KEY UPDATE is_enabled = GREATEST(is_enabled, VALUES(is_enabled))
    ");
    foreach ($mods as $mod) {
        $ins->execute([$groupPk, $mod, $enabled]);
    }
}

function gc_sync_user_group_map_for_owner(PDO $pdo, int $ownerId): void
{
    if ($ownerId <= 0 || !gc_has_groups_table($pdo)) {
        return;
    }
    try {
        $pdo->query('SELECT 1 FROM user_group_map LIMIT 1');
    } catch (Throwable $e) {
        return;
    }

    $stmt = $pdo->prepare("
        INSERT IGNORE INTO user_group_map (user_id, group_id)
        SELECT DISTINCT ucm.user_id, g.id
        FROM user_company_map ucm
        INNER JOIN company c ON c.id = ucm.company_id
        INNER JOIN `groups` g ON g.owner_id = c.owner_id
        WHERE c.owner_id = ?
          AND (
            UPPER(TRIM(COALESCE(c.group_id, ''))) = UPPER(TRIM(g.group_code))
            OR UPPER(TRIM(c.company_id)) = UPPER(TRIM(g.group_code))
          )
    ");
    $stmt->execute([$ownerId]);
}

/**
 * Upgrade account_company rows pointing at group-entity companies to scope_type=group.
 */
function gc_upgrade_account_company_group_scope_for_owner(PDO $pdo, int $ownerId): void
{
    if ($ownerId <= 0 || !gc_has_groups_table($pdo)) {
        return;
    }
    if (!gc_table_has_columns($pdo, 'account_company', 'scope_type')) {
        return;
    }

    $pdo->prepare("
        UPDATE account_company ac
        INNER JOIN company c ON c.id = ac.company_id
        INNER JOIN `groups` g
          ON g.owner_id = c.owner_id
         AND UPPER(TRIM(g.group_code)) = UPPER(TRIM(c.company_id))
        SET ac.scope_type = 'group',
            ac.scope_id = g.id
        WHERE c.owner_id = ?
    ")->execute([$ownerId]);
}

/**
 * Remove orphan placeholder companies (empty company_id), not group entity rows.
 */
function gc_delete_orphan_empty_company_rows(PDO $pdo, int $ownerId): void
{
    if ($ownerId <= 0) {
        return;
    }
    $pdo->prepare("
        DELETE FROM company
        WHERE owner_id = ?
          AND TRIM(COALESCE(company_id, '')) = ''
          AND (group_id IS NULL OR TRIM(group_id) = '')
    ")->execute([$ownerId]);
}

/**
 * Full bootstrap for one domain owner after groups are saved.
 */
function gc_bootstrap_owner_group_tenants(PDO $pdo, int $ownerId, string $createdBy = 'system'): void
{
    if ($ownerId <= 0 || !gc_has_groups_table($pdo)) {
        return;
    }

    $stmt = $pdo->prepare('SELECT id FROM `groups` WHERE owner_id = ?');
    $stmt->execute([$ownerId]);
    $groupPks = $stmt->fetchAll(PDO::FETCH_COLUMN);

    foreach ($groupPks as $pk) {
        $groupPk = (int) $pk;
        gc_ensure_group_entity_company_for_group_pk($pdo, $groupPk, $createdBy);
        gc_sync_tenant_module_policy_for_group($pdo, $groupPk);
    }

    gc_upgrade_account_company_group_scope_for_owner($pdo, $ownerId);
    gc_sync_user_group_map_for_owner($pdo, $ownerId);
    gc_delete_orphan_empty_company_rows($pdo, $ownerId);
}

/**
 * Bootstrap all owners (migration / one-off).
 */
function gc_bootstrap_all_group_tenants(PDO $pdo): void
{
    if (!gc_has_groups_table($pdo)) {
        return;
    }
    $ownerIds = $pdo->query('SELECT DISTINCT owner_id FROM `groups` WHERE owner_id IS NOT NULL')
        ->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ownerIds as $oid) {
        gc_bootstrap_owner_group_tenants($pdo, (int) $oid, 'migration');
    }
}
