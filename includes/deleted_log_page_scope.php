<?php
/**
 * Deleted Log 列表：用「用户可访问的全部公司」做范围，避免只按当前 session 公司过滤
 *（Owner 在 A 公司删了 B 公司数据时，以前 session 在 A 就看不到 B 的日志）
 *
 * @return array{mode:'one'|'in'|'none', id?:string, ids?:list<string>}
 */
function deleted_log_page_company_scope(PDO $pdo): array
{
    $userType = strtolower((string) ($_SESSION['user_type'] ?? 'user'));
    $sessionCid = trim((string) ($_SESSION['company_id'] ?? ''));
    $collected = [];

    if ($userType === 'user') {
        $uid = (int) ($_SESSION['user_id'] ?? 0);
        if ($uid > 0) {
            try {
                $st = $pdo->prepare('SELECT DISTINCT company_id FROM user_company_map WHERE user_id = ?');
                $st->execute([$uid]);
                $collected = array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);
            } catch (Throwable $e) {
                error_log('deleted_log_page_company_scope user map: ' . $e->getMessage());
            }
        }
    } elseif ($userType === 'owner') {
        $oid = (int) ($_SESSION['owner_id'] ?? $_SESSION['real_owner_id'] ?? 0);
        if ($oid > 0) {
            try {
                $st = $pdo->prepare('SELECT id FROM company WHERE owner_id = ? ORDER BY id ASC');
                $st->execute([$oid]);
                $collected = array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);
            } catch (Throwable $e) {
                error_log('deleted_log_page_company_scope owner companies: ' . $e->getMessage());
            }
        }
    }

    $collected = array_values(array_unique(array_filter($collected, static fn ($v) => $v !== '')));

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
