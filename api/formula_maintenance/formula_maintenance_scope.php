<?php
/**
 * Shared scope resolution for Formula Maintenance APIs.
 */

require_once __DIR__ . '/../datacapture/data_capture_scope_common.php';
require_once __DIR__ . '/../transactions/transaction_scope.php';

/**
 * Group scope must query the group entity row (company_id = group code), never a subsidiary.
 */
function formulaMaintenanceResolveEntityCompanyId(PDO $pdo, int $companyId, bool $isGroupScope, string $groupId): int
{
    if (!$isGroupScope) {
        return $companyId;
    }
    $g = dcNormalizeGroupId($groupId);
    if ($g === '') {
        return 0;
    }
    $entityId = tx_resolve_group_entity_company_id($pdo, $g);

    return $entityId > 0 ? $entityId : 0;
}

/**
 * SQL: templates belong to a true group-entity company row (company_id code = group_id).
 */
function formulaMaintenanceSqlGroupEntityCompanyFilter(string $dctAlias = 'dct'): string
{
    $a = preg_replace('/[^a-zA-Z0-9_]/', '', $dctAlias) ?: 'dct';
    return " AND EXISTS (
        SELECT 1
        FROM company c_ge
        WHERE c_ge.id = {$a}.company_id
          AND TRIM(COALESCE(c_ge.company_id, '')) <> ''
          AND UPPER(TRIM(c_ge.company_id)) = UPPER(TRIM(COALESCE(c_ge.group_id, '')))
    ) ";
}

/**
 * SQL: templates on subsidiary companies only (exclude AP/IG group-entity rows).
 */
function formulaMaintenanceSqlSubsidiaryCompanyFilter(string $dctAlias = 'dct'): string
{
    $a = preg_replace('/[^a-zA-Z0-9_]/', '', $dctAlias) ?: 'dct';
    return " AND NOT EXISTS (
        SELECT 1
        FROM company c_ge
        WHERE c_ge.id = {$a}.company_id
          AND TRIM(COALESCE(c_ge.company_id, '')) <> ''
          AND UPPER(TRIM(c_ge.company_id)) = UPPER(TRIM(COALESCE(c_ge.group_id, '')))
    ) ";
}

function formulaMaintenanceCompanyIsGroupEntity(PDO $pdo, int $companyId): bool
{
    if ($companyId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare("
        SELECT 1
        FROM company c
        WHERE c.id = ?
          AND TRIM(COALESCE(c.company_id, '')) <> ''
          AND UPPER(TRIM(c.company_id)) = UPPER(TRIM(COALESCE(c.group_id, '')))
        LIMIT 1
    ");
    $stmt->execute([$companyId]);

    return (bool) $stmt->fetchColumn();
}

/**
 * @param array<string, mixed> $params
 * @return array{company_id: int, is_group_scope: bool, scope_process_sql: string}
 */
function formulaMaintenanceResolveRequestScope(PDO $pdo, array $params): array
{
    $hasExplicitScope = dcRequestHasExplicitScope($params);

    $scopeHint = strtolower(trim((string) ($params['report_scope'] ?? $params['capture_scope'] ?? '')));
    $groupId = dcNormalizeGroupId($params['group_id'] ?? $params['view_group'] ?? '');

    if ($hasExplicitScope) {
        $scopeResolved = resolveDataCaptureRequestScope($pdo, $params);
        $companyId = (int) $scopeResolved['company_id'];
        $isGroupScope = (bool) $scopeResolved['is_group_scope'];
        if ($groupId === '') {
            $groupId = dcNormalizeGroupId($scopeResolved['group_id'] ?? '');
        }
        // UI report_scope wins over dcIsGroupScopeHint (e.g. subsidiary C168 must not use group SALARY).
        if ($scopeHint === 'company') {
            $isGroupScope = false;
        } elseif ($scopeHint === 'group') {
            $isGroupScope = true;
        }
        $viewGroupForAccess = dcNormalizeGroupId(
            $params['view_group'] ?? $params['group_id'] ?? ''
        );
        if ($viewGroupForAccess !== '') {
            $groupId = $viewGroupForAccess;
        }
        dcAssertUserCanAccessCompany(
            $pdo,
            $companyId,
            $viewGroupForAccess !== '' ? $viewGroupForAccess : null
        );
    } else {
        $requested = isset($params['company_id']) ? trim((string) $params['company_id']) : '';
        if ($requested !== '') {
            $requested = (int) $requested;
            $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
            if ($userRole === 'owner') {
                $owner_id = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
                $stmt = $pdo->prepare('SELECT id FROM company WHERE id = ? AND owner_id = ?');
                $stmt->execute([$requested, $owner_id]);
                if ($stmt->fetchColumn()) {
                    $companyId = $requested;
                } else {
                    throw new Exception('无权访问该公司');
                }
            } elseif (!isset($_SESSION['company_id']) || (int) $_SESSION['company_id'] !== $requested) {
                throw new Exception('无权访问该公司');
            } else {
                $companyId = (int) $_SESSION['company_id'];
            }
        } elseif (!isset($_SESSION['company_id'])) {
            throw new Exception('缺少公司信息');
        } else {
            $companyId = (int) $_SESSION['company_id'];
        }
        $isGroupScope = false;
    }

    if ($isGroupScope) {
        $companyId = formulaMaintenanceResolveEntityCompanyId($pdo, $companyId, true, $groupId);
    }

    // Group: SALARY/BONUS on group-entity templates only.
    // Company: subsidiary templates only (never AP/IG entity rows).
    $scopeProcessSql = '';
    if ($isGroupScope) {
        $scopeProcessSql = dcSqlGroupProcessFilter('p') . formulaMaintenanceSqlGroupEntityCompanyFilter('dct');
    } else {
        $scopeProcessSql = formulaMaintenanceSqlSubsidiaryCompanyFilter('dct');
    }

    return [
        'company_id' => $companyId,
        'is_group_scope' => $isGroupScope,
        'scope_process_sql' => $scopeProcessSql,
    ];
}

/**
 * Process must belong to scoped company_id; group scope = SALARY/BONUS only.
 */
function formulaMaintenanceAssertProcessIdForScope(
    PDO $pdo,
    int $processId,
    int $companyId,
    bool $isGroupScope
): void {
    if ($processId <= 0 || $companyId <= 0) {
        throw new Exception('Invalid process for scope');
    }
    $stmt = $pdo->prepare(
        'SELECT UPPER(TRIM(process_id)) FROM process WHERE id = ? AND company_id = ? LIMIT 1'
    );
    $stmt->execute([$processId, $companyId]);
    $code = strtoupper(trim((string) ($stmt->fetchColumn() ?: '')));
    if ($code === '') {
        throw new Exception('Process not found for scope');
    }
    if ($isGroupScope && !in_array($code, ['SALARY', 'BONUS'], true)) {
        throw new Exception('集团范围仅支持 SALARY / BONUS Process');
    }
}

/**
 * Resolve process.id by code for Formula Maintenance (company scope allows subsidiary SALARY).
 */
function formulaMaintenanceResolveProcessIdByCode(
    PDO $pdo,
    int $companyId,
    string $processCode,
    bool $isGroupScope
): ?int {
    $code = strtoupper(trim($processCode));
    if ($code === '') {
        return null;
    }
    if ($isGroupScope && !in_array($code, ['SALARY', 'BONUS'], true)) {
        return null;
    }
    $sql = 'SELECT id FROM process WHERE company_id = ? AND UPPER(TRIM(process_id)) = ?';
    if ($isGroupScope) {
        $sql .= " AND UPPER(TRIM(process_id)) IN ('SALARY', 'BONUS')";
    }
    $sql .= ' ORDER BY id ASC LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId, $code]);
    $id = (int) ($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : null;
}

/**
 * Resolve list filter: prefer numeric process.id (aligned with Capture Maintenance).
 *
 * @return array{process_id: int|null, legacy_code: string|null}
 */
function formulaMaintenanceResolveProcessFilter(
    PDO $pdo,
    string $processParam,
    int $companyId,
    bool $isGroupScope
): array {
    if ($processParam === '') {
        return ['process_id' => null, 'legacy_code' => null];
    }

    if (preg_match('/^\d+$/', $processParam)) {
        $processId = (int) $processParam;
        formulaMaintenanceAssertProcessIdForScope($pdo, $processId, $companyId, $isGroupScope);
        return ['process_id' => $processId, 'legacy_code' => null];
    }

    // Legacy clients: process code or "CODE (DESC)" label.
    $legacyCode = $processParam;
    if (strpos($legacyCode, '(') !== false) {
        $legacyCode = trim(explode('(', $legacyCode)[0]);
    }
    $legacyCode = strtoupper(trim($legacyCode));
    if ($legacyCode === '') {
        return ['process_id' => null, 'legacy_code' => null];
    }
    if ($isGroupScope && !in_array($legacyCode, ['SALARY', 'BONUS'], true)) {
        throw new Exception('集团范围仅支持 SALARY / BONUS Process');
    }
    $resolvedId = formulaMaintenanceResolveProcessIdByCode($pdo, $companyId, $legacyCode, $isGroupScope);
    if ($resolvedId === null || $resolvedId <= 0) {
        return ['process_id' => null, 'legacy_code' => $legacyCode];
    }
    return ['process_id' => (int) $resolvedId, 'legacy_code' => null];
}

/**
 * SQL: 1 when the joined process row belongs to a group-entity company (company_id = group_id).
 */
function formulaMaintenanceSqlProcessOnGroupEntityFlag(string $processAlias = 'p'): string
{
    $a = preg_replace('/[^a-zA-Z0-9_]/', '', $processAlias) ?: 'p';
    return "CASE WHEN EXISTS (
        SELECT 1
        FROM company c_ge
        WHERE c_ge.id = {$a}.company_id
          AND TRIM(COALESCE(c_ge.company_id, '')) <> ''
          AND UPPER(TRIM(c_ge.company_id)) = UPPER(TRIM(COALESCE(c_ge.group_id, '')))
    ) THEN 1 ELSE 0 END";
}

/**
 * SALARY/BONUS: group-entity process → code only; subsidiary company process → CODE (CODE).
 */
function formulaMaintenanceFormatProcessDisplay(
    string $processCode,
    ?string $descriptionName = null,
    bool $processOnGroupEntity = false,
    ?bool $isGroupScope = null
): string {
    $code = strtoupper(trim($processCode));
    if (in_array($code, ['SALARY', 'BONUS'], true)) {
        $groupStyle = $isGroupScope !== null ? $isGroupScope : $processOnGroupEntity;
        if ($groupStyle) {
            return $code;
        }

        return $code . ' (' . $code . ')';
    }
    $desc = trim((string) ($descriptionName ?? ''));
    if ($desc !== '') {
        return $processCode . ' (' . $desc . ')';
    }
    return $processCode;
}

/**
 * SQL JOIN process + template binding; when filtering by process id, never attach SALARY legacy rows to BONUS.
 */
function formulaMaintenanceSqlTemplateProcessJoin(?int $processIdFilter = null): string
{
    if ($processIdFilter !== null && $processIdFilter > 0) {
        $pid = (int) $processIdFilter;
        return "INNER JOIN process p ON p.company_id = dct.company_id
            AND p.id = {$pid}
            AND (
                (dct.process_id REGEXP '^[0-9]+$' AND CAST(dct.process_id AS UNSIGNED) = {$pid})
                OR (
                    dct.process_id NOT REGEXP '^[0-9]+$'
                    AND UPPER(TRIM(dct.process_id)) = UPPER(TRIM(p.process_id))
                )
            )";
    }

    return "INNER JOIN process p ON p.company_id = dct.company_id
        AND (
            (dct.process_id REGEXP '^[0-9]+$' AND p.id = CAST(dct.process_id AS UNSIGNED))
            OR (
                dct.process_id NOT REGEXP '^[0-9]+$'
                AND UPPER(TRIM(dct.process_id)) = UPPER(TRIM(p.process_id))
                AND p.id = (
                    SELECT MIN(p2.id)
                    FROM process p2
                    WHERE p2.company_id = dct.company_id
                      AND UPPER(TRIM(p2.process_id)) = UPPER(TRIM(dct.process_id))
                )
            )
        )";
}
