<?php
/**
 * Shared company scope resolution for transaction APIs (group login + view_group).
 */

require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/../includes/member_linked_closure.php';

function tx_normalize_view_group(?string $viewGroup): ?string
{
    if ($viewGroup === null) {
        return null;
    }
    $g = strtoupper(trim($viewGroup));
    return $g !== '' ? $g : null;
}

/** Match accountlistapi resolveGroupEntityCompanyId — group entity numeric id from DB. */
function tx_resolve_group_entity_company_id(PDO $pdo, string $groupId): int
{
    $g = strtoupper(trim($groupId));
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
 * @param array<string, mixed> $params GET/POST params (company_id, view_group, group_id)
 */
function tx_resolve_request_company_id(PDO $pdo, array $params): int
{
    $viewGroup = tx_normalize_view_group(isset($params['view_group']) ? (string) $params['view_group'] : null);
    $groupScope = tx_normalize_view_group(isset($params['group_id']) ? (string) $params['group_id'] : null);
    if ($groupScope !== null && $viewGroup === null) {
        $viewGroup = $groupScope;
    }
    $requestedRaw = $params['company_id'] ?? null;

    if ($requestedRaw !== null && $requestedRaw !== '') {
        $requested = (int) $requestedRaw;
        if ($requested <= 0) {
            throw new Exception('无效的 company_id');
        }

        if (gc_is_group_login()) {
            if (!gc_session_can_access_company_id($pdo, $requested, $viewGroup)) {
                throw new Exception('无权访问该公司');
            }
            return $requested;
        }

        $userRole = isset($_SESSION['role']) ? strtolower((string) $_SESSION['role']) : '';
        $userType = isset($_SESSION['user_type']) ? strtolower((string) $_SESSION['user_type']) : '';

        if ($userRole === 'owner') {
            $ownerId = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare('SELECT id FROM company WHERE id = ? AND owner_id = ?');
            $stmt->execute([$requested, $ownerId]);
            if ($stmt->fetchColumn()) {
                return $requested;
            }
            throw new Exception('无权访问该公司');
        }

        if ($userType === 'member') {
            $memberAccountId = member_session_canonical_account_id();
            $stmt = $pdo->prepare('
                SELECT 1
                FROM account_company ac
                WHERE ac.account_id = ? AND ac.company_id = ?
                LIMIT 1
            ');
            $stmt->execute([$memberAccountId, $requested]);
            if ($stmt->fetchColumn()) {
                return $requested;
            }
            throw new Exception('无权访问该公司');
        }

        if (isset($_SESSION['company_id']) && (int) $_SESSION['company_id'] === $requested) {
            return $requested;
        }

        $ucm = $pdo->prepare('SELECT 1 FROM user_company_map WHERE user_id = ? AND company_id = ? LIMIT 1');
        $ucm->execute([$_SESSION['user_id'], $requested]);
        if ($ucm->fetchColumn()) {
            return $requested;
        }

        // Group entity company: user session may be a subsidiary (e.g. C168) while API targets AP entity id.
        if ($viewGroup !== null) {
            $entityId = tx_resolve_group_entity_company_id($pdo, $viewGroup);
            if ($entityId > 0 && $requested === $entityId) {
                $grpStmt = $pdo->prepare("
                    SELECT COUNT(*)
                    FROM user_company_map ucm
                    INNER JOIN company c ON c.id = ucm.company_id
                    WHERE ucm.user_id = ?
                      AND UPPER(TRIM(COALESCE(c.group_id, ''))) = ?
                ");
                $grpStmt->execute([$_SESSION['user_id'], $viewGroup]);
                if ((int) $grpStmt->fetchColumn() > 0) {
                    return $requested;
                }
            }
            if (gc_session_can_access_company_id($pdo, $requested, $viewGroup)) {
                return $requested;
            }
        }

        throw new Exception('无权访问该公司');
    }

    if ($groupScope !== null) {
        $entityId = tx_resolve_group_entity_company_id($pdo, $groupScope);
        if ($entityId > 0) {
            if (gc_is_group_login()) {
                if (!gc_session_can_access_company_id($pdo, $entityId, $viewGroup)) {
                    throw new Exception('无权访问该公司');
                }
            }
            return $entityId;
        }
    }

    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }

    return (int) $_SESSION['company_id'];
}
