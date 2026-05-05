<?php
/**
 * Deleted Log 列表：公司与 Account List 完全一致（getCompaniesByUser / getCompaniesByOwner），
 * 确保管理员 / Owner 能看到名下全部公司的删除记录。
 *
 * @return array{mode:'one'|'in'|'none', id?:string, ids?:list<string>}
 */
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
