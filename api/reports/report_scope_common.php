<?php
/**
 * Shared report scope helpers (Customer / Domain report APIs).
 */

require_once __DIR__ . '/../../includes/permissions.php';
require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/../transactions/transaction_scope.php';

function reportNormalizeGroupId(?string $groupId): string
{
    return strtoupper(trim((string) $groupId));
}

function assertGroupEntityAccess(PDO $pdo, string $groupId, int $entityCompanyId): void
{
    $g = reportNormalizeGroupId($groupId);
    if ($g === '' || $entityCompanyId <= 0) {
        throw new Exception('无效的 group_id');
    }

    if (gc_is_group_login()) {
        if (!gc_session_can_access_company_id($pdo, $entityCompanyId, $g)) {
            throw new Exception('无权访问该集团');
        }
        return;
    }

    $role = strtolower($_SESSION['role'] ?? '');
    if ($role === 'owner') {
        $ownerId = (int) ($_SESSION['owner_id'] ?? $_SESSION['user_id']);
        $stmt = $pdo->prepare('SELECT id FROM company WHERE id = ? AND owner_id = ? LIMIT 1');
        $stmt->execute([$entityCompanyId, $ownerId]);
        if ($stmt->fetchColumn()) {
            return;
        }
        throw new Exception('无权访问该集团');
    }

    tx_resolve_request_company_id($pdo, [
        'company_id' => (string) $entityCompanyId,
        'view_group' => $g,
        'group_id' => $g,
    ]);
}

function reportGroupHasCategorySubsidiary(PDO $pdo, string $groupId, string $category): bool
{
    $g = reportNormalizeGroupId($groupId);
    if ($g === '') {
        return false;
    }

    $stmt = $pdo->prepare("
        SELECT id
        FROM company
        WHERE UPPER(TRIM(COALESCE(group_id, ''))) = ?
          AND TRIM(COALESCE(company_id, '')) <> ''
          AND UPPER(TRIM(company_id)) <> ?
    ");
    $stmt->execute([$g, $g]);

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $sid = (int) ($row['id'] ?? 0);
        if ($sid > 0 && checkCompanyCategoryPermission($pdo, $sid, $category)) {
            return true;
        }
    }

    return false;
}

function reportGroupHasGamesSubsidiary(PDO $pdo, string $groupId): bool
{
    return reportGroupHasCategorySubsidiary($pdo, $groupId, 'Games');
}

function reportGroupHasBankSubsidiary(PDO $pdo, string $groupId): bool
{
    return reportGroupHasCategorySubsidiary($pdo, $groupId, 'Bank');
}

function checkReportGamesAccess(PDO $pdo, int $companyId, ?string $groupId): bool
{
    if (checkCompanyCategoryPermission($pdo, $companyId, 'Games')) {
        return true;
    }

    return reportGroupHasGamesSubsidiary($pdo, (string) ($groupId ?? ''));
}

/** Games or Bank — used by maintenance / data-capture scope APIs. */
function checkReportMaintenanceAccess(PDO $pdo, int $companyId, ?string $groupId): bool
{
    if (checkCompanyCategoryPermission($pdo, $companyId, 'Games')) {
        return true;
    }
    if (checkCompanyCategoryPermission($pdo, $companyId, 'Bank')) {
        return true;
    }

    $g = (string) ($groupId ?? '');
    return reportGroupHasGamesSubsidiary($pdo, $g) || reportGroupHasBankSubsidiary($pdo, $g);
}

/**
 * Resolve numeric company id for report APIs (group entity when group-only).
 *
 * @param string $categoryAccess 'games' (customer/domain reports) or 'maintenance' (Games + Bank)
 * @return array{company_id: int, group_id: string, report_scope_hint: string, request_params: array<string, mixed>}
 */
function resolveReportRequestCompanyScope(PDO $pdo, array $get, string $categoryAccess = 'games'): array
{
    $groupId = reportNormalizeGroupId($get['group_id'] ?? '');
    $companyIdRaw = $get['company_id'] ?? '';
    $reportScopeHint = strtolower(trim((string) ($get['report_scope'] ?? '')));
    $requestParams = $get;

    if ($companyIdRaw === '' || $companyIdRaw === null) {
        if ($groupId === '') {
            throw new Exception('缺少公司或集团信息');
        }
        $entityId = tx_resolve_group_entity_company_id($pdo, $groupId);
        if ($entityId <= 0) {
            if (!gc_session_can_access_group_code($pdo, $groupId)) {
                throw new Exception('无效的集团');
            }
            $subs = gc_company_numeric_ids_for_group_code($pdo, $groupId);
            $entityId = $subs !== [] ? (int) $subs[0] : 0;
            if ($entityId <= 0) {
                throw new Exception('无效的集团');
            }
        } else {
            assertGroupEntityAccess($pdo, $groupId, $entityId);
        }
        $requestParams['company_id'] = (string) $entityId;
        if (trim((string) ($requestParams['view_group'] ?? '')) === '') {
            $requestParams['view_group'] = $groupId;
        }
        $reportScopeHint = 'group';
    }

    $companyId = tx_resolve_request_company_id($pdo, $requestParams);

    $viewGroup = reportNormalizeGroupId($get['view_group'] ?? '');
    $groupForAccess = $groupId !== '' ? $groupId : ($viewGroup !== '' ? $viewGroup : null);
    $hasAccess = $categoryAccess === 'maintenance'
        ? checkReportMaintenanceAccess($pdo, $companyId, $groupForAccess)
        : checkReportGamesAccess($pdo, $companyId, $groupForAccess);
    if (!$hasAccess) {
        throw new Exception('Unauthorized permission category');
    }

    return [
        'company_id' => $companyId,
        'group_id' => $groupId,
        'report_scope_hint' => $reportScopeHint,
        'request_params' => $requestParams,
    ];
}
