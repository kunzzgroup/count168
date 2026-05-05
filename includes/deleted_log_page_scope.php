<?php
/**
 * Deleted Log 列表：以 getCompaniesByUser / getCompaniesByOwner 为基准，再按 **GroupID** 扩展到同组全部公司。
 * 否则会出现：Owner 在 A 公司删账号（deleted_logs.company_id=A），Admin 的 user_company_map 仅有 B 公司时查不到 A 的记录。
 *
 * @return array{mode:'one'|'in'|'none', id?:string, ids?:list<string>}
 */
function deleted_log_expand_company_scope_by_group(PDO $pdo, array $companyIds): array
{
    $companyIds = array_values(array_unique(array_filter(array_map(static fn ($v) => trim((string) $v), $companyIds), static fn ($v) => $v !== '')));
    if ($companyIds === []) {
        return [];
    }
    $ints = array_values(array_filter(array_map('intval', $companyIds), static fn ($v) => $v > 0));
    if ($ints === []) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($ints), '?'));
    try {
        $stmt = $pdo->prepare(
            "SELECT DISTINCT TRIM(c.group_id) AS gid FROM company c
             WHERE c.id IN ($placeholders)
               AND c.group_id IS NOT NULL AND TRIM(c.group_id) <> ''"
        );
        $stmt->execute($ints);
        $groups = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (Throwable $e) {
        error_log('deleted_log_expand_company_scope_by_group: ' . $e->getMessage());
        return [];
    }

    $extra = [];
    foreach ($groups as $gid) {
        if ($gid === false || $gid === null || trim((string) $gid) === '') {
            continue;
        }
        $g = trim((string) $gid);
        try {
            $q = $pdo->prepare(
                'SELECT c.id FROM company c
                 WHERE c.company_id <> \'\' AND c.company_id IS NOT NULL
                   AND c.group_id IS NOT NULL AND LOWER(TRIM(c.group_id)) = LOWER(TRIM(?))'
            );
            $q->execute([$g]);
            while ($row = $q->fetch(PDO::FETCH_ASSOC)) {
                if (!empty($row['id'])) {
                    $extra[] = (string) $row['id'];
                }
            }
        } catch (Throwable $e) {
            error_log('deleted_log_expand_company_scope_by_group ids: ' . $e->getMessage());
        }
    }

    return $extra;
}

function deleted_log_page_company_scope(PDO $pdo): array
{
    require_once __DIR__ . '/../api/get_companies_helper.php';

    $uid = (int) ($_SESSION['user_id'] ?? 0);
    $role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
    $userType = strtolower((string) ($_SESSION['user_type'] ?? 'user'));

    $collected = [];

    try {
        if ($userType === 'owner' || $role === 'owner') {
            $ownerId = (int) ($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $uid);
            if ($ownerId > 0) {
                $rows = getCompaniesByOwner($pdo, $ownerId, true, true);
                foreach ($rows as $r) {
                    if (!empty($r['id'])) {
                        $collected[] = (string) $r['id'];
                    }
                }
            }
        } elseif ($uid > 0) {
            $rows = getCompaniesByUser($pdo, $uid, true, true);
            foreach ($rows as $r) {
                if (!empty($r['id'])) {
                    $collected[] = (string) $r['id'];
                }
            }
        }
    } catch (Throwable $e) {
        error_log('deleted_log_page_company_scope: ' . $e->getMessage());
    }

    $collected = array_values(array_unique(array_filter($collected, static fn ($v) => $v !== '')));

    $sessionCid = trim((string) ($_SESSION['company_id'] ?? ''));
    if ($sessionCid !== '' && !in_array($sessionCid, $collected, true)) {
        $collected[] = $sessionCid;
    }

    $expanded = deleted_log_expand_company_scope_by_group($pdo, $collected);
    if ($expanded !== []) {
        $collected = array_merge($collected, $expanded);
        $collected = array_values(array_unique(array_filter($collected, static fn ($v) => $v !== '')));
    }

    if (count($collected) === 0 && $sessionCid !== '') {
        return ['mode' => 'one', 'id' => $sessionCid];
    }
    if (count($collected) === 0) {
        return ['mode' => 'none'];
    }
    if (count($collected) === 1) {
        return ['mode' => 'one', 'id' => $collected[0]];
    }

    return ['mode' => 'in', 'ids' => $collected];
}
