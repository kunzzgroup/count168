<?php
/**
 * Shared company scope resolution for transaction APIs (group login + view_group).
 */

require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/../../includes/group_scope_resolve.php';
require_once __DIR__ . '/../includes/member_linked_closure.php';

function tx_normalize_view_group(?string $viewGroup): ?string
{
    if ($viewGroup === null) {
        return null;
    }
    $g = strtoupper(trim($viewGroup));
    return $g !== '' ? $g : null;
}

/**
 * Legacy group-entity company row only (company_id = AP/IG).
 * Do not fall back to a subsidiary — use groups.id ledger scope instead.
 */
function tx_resolve_group_entity_company_id(PDO $pdo, string $groupId): int
{
    return gc_resolve_legacy_group_entity_company_id($pdo, $groupId);
}

/** Numeric company id when an API still requires one (legacy entity, else first subsidiary). */
function tx_resolve_group_anchor_company_id(PDO $pdo, string $groupId): int
{
    return gc_resolve_group_anchor_company_id($pdo, $groupId);
}

function tx_request_has_group_only_scope(array $params): bool
{
    $requestedRaw = $params['company_id'] ?? null;
    if ($requestedRaw !== null && trim((string) $requestedRaw) !== '') {
        return false;
    }
    $viewGroup = tx_normalize_view_group(isset($params['view_group']) ? (string) $params['view_group'] : null);
    $groupScope = tx_normalize_view_group(isset($params['group_id']) ? (string) $params['group_id'] : null);

    return $viewGroup !== null || $groupScope !== null;
}

/**
 * Resolve transaction list scope (group ledger vs company).
 *
 * @return array{
 *   mode: 'group'|'company',
 *   company_id: int,
 *   group_code: string,
 *   group_scope_id: int,
 *   view_group: ?string
 * }
 */
function tx_resolve_transaction_list_scope(PDO $pdo, array $params): array
{
    $viewGroup = tx_normalize_view_group(isset($params['view_group']) ? (string) $params['view_group'] : null);
    $groupScope = tx_normalize_view_group(isset($params['group_id']) ? (string) $params['group_id'] : null);
    if ($groupScope !== null && $viewGroup === null) {
        $viewGroup = $groupScope;
    }
    $groupCode = $viewGroup ?? $groupScope ?? '';

    if (tx_request_has_group_only_scope($params)) {
        if ($groupCode === '') {
            throw new Exception('缺少 group_id');
        }
        if (!gc_session_can_access_group_code($pdo, $groupCode)) {
            throw new Exception('无权访问该集团');
        }
        $legacyEntityId = gc_resolve_legacy_group_entity_company_id($pdo, $groupCode);
        if ($legacyEntityId > 0) {
            return [
                'mode' => 'company',
                'company_id' => $legacyEntityId,
                'group_code' => $groupCode,
                'group_scope_id' => gc_resolve_group_pk_by_code($pdo, $groupCode),
                'view_group' => $groupCode,
            ];
        }
        $groupScopeId = gc_resolve_group_pk_by_code($pdo, $groupCode);
        if ($groupScopeId <= 0) {
            throw new Exception('无效的 group_id');
        }

        return [
            'mode' => 'group',
            'company_id' => 0,
            'group_code' => $groupCode,
            'group_scope_id' => $groupScopeId,
            'view_group' => $groupCode,
        ];
    }

    $companyId = tx_resolve_request_company_id($pdo, $params);

    return [
        'mode' => 'company',
        'company_id' => $companyId,
        'group_code' => $groupCode,
        'group_scope_id' => $groupCode !== '' ? gc_resolve_group_pk_by_code($pdo, $groupCode) : 0,
        'view_group' => $viewGroup,
    ];
}

function tx_sql_transaction_scope_where(array $scope, string $alias = 't'): string
{
    return (($scope['mode'] ?? '') === 'group')
        ? "{$alias}.scope_type = 'group' AND {$alias}.scope_id = ?"
        : "{$alias}.company_id = ?";
}

function tx_bind_transaction_scope_id(array $scope): int
{
    return (($scope['mode'] ?? '') === 'group')
        ? (int) ($scope['group_scope_id'] ?? 0)
        : (int) ($scope['company_id'] ?? 0);
}

function tx_permission_company_id_for_scope(PDO $pdo, array $scope): int
{
    $companyId = (int) ($scope['company_id'] ?? 0);
    if ($companyId > 0) {
        return $companyId;
    }
    $groupCode = (string) ($scope['group_code'] ?? '');

    return $groupCode !== '' ? tx_resolve_group_anchor_company_id($pdo, $groupCode) : 0;
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

    if ($groupScope !== null && ($requestedRaw === null || trim((string) $requestedRaw) === '')) {
        $entityId = tx_resolve_group_entity_company_id($pdo, $groupScope);
        if ($entityId > 0) {
            if (gc_is_group_login()) {
                if (!gc_session_can_access_company_id($pdo, $entityId, $viewGroup)) {
                    throw new Exception('无权访问该公司');
                }
            }
            return $entityId;
        }
        throw new Exception('缺少 company_id');
    }

    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }

    $sessionCompanyId = (int) $_SESSION['company_id'];
    if (gc_is_group_login()) {
        $view = $viewGroup ?? $groupScope ?? gc_session_login_identifier();
        if (!gc_session_can_access_company_id($pdo, $sessionCompanyId, $view)) {
            throw new Exception('无权访问该公司');
        }
    }

    return $sessionCompanyId;
}
