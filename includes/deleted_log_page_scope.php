<?php
/**
 * Deleted Log 列表：解析当前用户可见的 company_id（会话为空时从库补全）
 *
 * @return array{mode:'one'|'in'|'none', id?:string, ids?:list<string>}
 */
function deleted_log_page_company_scope(PDO $pdo): array
{
    $s = trim((string) ($_SESSION['company_id'] ?? ''));
    if ($s !== '') {
        return ['mode' => 'one', 'id' => $s];
    }

    $userType = strtolower((string) ($_SESSION['user_type'] ?? 'user'));

    if ($userType === 'user') {
        $uid = (int) ($_SESSION['user_id'] ?? 0);
        if ($uid > 0) {
            try {
                $st = $pdo->prepare('SELECT company_id FROM user_company_map WHERE user_id = ? ORDER BY company_id ASC');
                $st->execute([$uid]);
                $ids = array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);
                $ids = array_values(array_filter($ids, static fn ($v) => $v !== ''));
                if (count($ids) === 1) {
                    return ['mode' => 'one', 'id' => $ids[0]];
                }
                if (count($ids) > 1) {
                    return ['mode' => 'in', 'ids' => $ids];
                }
            } catch (Throwable $e) {
                error_log('deleted_log_page_company_scope user map: ' . $e->getMessage());
            }
        }
    }

    if ($userType === 'owner') {
        $oid = (int) ($_SESSION['owner_id'] ?? $_SESSION['real_owner_id'] ?? 0);
        if ($oid > 0) {
            try {
                $st = $pdo->prepare('SELECT id FROM company WHERE owner_id = ? ORDER BY id ASC');
                $st->execute([$oid]);
                $ids = array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);
                $ids = array_values(array_filter($ids, static fn ($v) => $v !== ''));
                if (count($ids) === 1) {
                    return ['mode' => 'one', 'id' => $ids[0]];
                }
                if (count($ids) > 1) {
                    return ['mode' => 'in', 'ids' => $ids];
                }
            } catch (Throwable $e) {
                error_log('deleted_log_page_company_scope owner companies: ' . $e->getMessage());
            }
        }
    }

    return ['mode' => 'none'];
}
