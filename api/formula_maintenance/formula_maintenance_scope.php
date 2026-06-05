<?php
/**
 * Shared scope resolution for Formula Maintenance APIs.
 */

require_once __DIR__ . '/../datacapture/data_capture_scope_common.php';
require_once __DIR__ . '/../transactions/transaction_scope.php';
require_once __DIR__ . '/../../includes/tenant_scope.php';

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
    if ($entityId > 0) {
        return $entityId;
    }

    return gc_resolve_group_anchor_company_id($pdo, $g);
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

/**
 * @return list<array{id: int, pcode: string, currency_code: string, desc_name: string, currency_scope: string}>
 */
function formulaMaintenanceFetchPayrollProcessRows(PDO $pdo, int $companyId): array
{
    if ($companyId <= 0) {
        return [];
    }
    $stmt = $pdo->prepare("
        SELECT p.id,
               UPPER(TRIM(p.process_id)) AS pcode,
               UPPER(TRIM(COALESCE(c.code, ''))) AS currency_code,
               UPPER(TRIM(COALESCE(d.name, ''))) AS desc_name,
               LOWER(TRIM(COALESCE(c.scope_type, ''))) AS currency_scope
        FROM process p
        LEFT JOIN currency c ON c.id = p.currency_id
        LEFT JOIN description d ON d.id = p.description_id
        WHERE p.company_id = ?
          AND UPPER(TRIM(p.process_id)) IN ('SALARY', 'BONUS')
        ORDER BY p.id ASC
    ");
    $stmt->execute([$companyId]);
    $rows = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = [
            'id' => (int) ($row['id'] ?? 0),
            'pcode' => (string) ($row['pcode'] ?? ''),
            'currency_code' => (string) ($row['currency_code'] ?? ''),
            'desc_name' => (string) ($row['desc_name'] ?? ''),
            'currency_scope' => (string) ($row['currency_scope'] ?? ''),
        ];
    }

    return $rows;
}

/** Heuristic: group ledger payroll (SALARY) vs subsidiary SALARY (SALARY) on same anchor company. */
function formulaMaintenanceRowLooksLikeGroupPayroll(array $row): bool
{
    if (($row['currency_scope'] ?? '') === 'group') {
        return true;
    }
    $pcode = strtoupper(trim((string) ($row['pcode'] ?? '')));
    $desc = strtoupper(trim((string) ($row['desc_name'] ?? '')));
    if ($pcode !== '' && $desc === $pcode) {
        return true;
    }
    $ccy = strtoupper(trim((string) ($row['currency_code'] ?? '')));
    if ($ccy === 'SGD') {
        return false;
    }
    if ($ccy === 'MYR') {
        return true;
    }

    return false;
}

/**
 * @return array{group: list<int>, subsidiary: list<int>}
 */
function formulaMaintenanceClassifyPayrollProcessIds(PDO $pdo, int $companyId): array
{
    $rows = formulaMaintenanceFetchPayrollProcessRows($pdo, $companyId);
    $group = [];
    $subsidiary = [];
    foreach ($rows as $row) {
        if ($row['id'] <= 0) {
            continue;
        }
        if (formulaMaintenanceRowLooksLikeGroupPayroll($row)) {
            $group[] = $row['id'];
        } else {
            $subsidiary[] = $row['id'];
        }
    }
    if ($subsidiary === [] && count($rows) >= 2) {
        $byCode = [];
        foreach ($rows as $row) {
            $byCode[$row['pcode']][] = $row;
        }
        $group = [];
        $subsidiary = [];
        foreach ($byCode as $codeRows) {
            if (count($codeRows) < 2) {
                foreach ($codeRows as $row) {
                    if (formulaMaintenanceRowLooksLikeGroupPayroll($row)) {
                        $group[] = $row['id'];
                    } else {
                        $subsidiary[] = $row['id'];
                    }
                }
                continue;
            }
            usort($codeRows, static fn (array $a, array $b): int => $a['id'] <=> $b['id']);
            $group[] = $codeRows[0]['id'];
            $subsidiary[] = $codeRows[count($codeRows) - 1]['id'];
        }
    }
    if ($group === [] && $subsidiary === [] && $rows !== []) {
        $group[] = $rows[0]['id'];
        if (count($rows) > 1) {
            $subsidiary[] = $rows[count($rows) - 1]['id'];
        }
    }

    return [
        'group' => array_values(array_unique(array_filter($group, static fn (int $id): bool => $id > 0))),
        'subsidiary' => array_values(array_unique(array_filter($subsidiary, static fn (int $id): bool => $id > 0))),
    ];
}

function formulaMaintenanceSqlProcessIdInList(array $ids, string $processAlias = 'p'): string
{
    $a = preg_replace('/[^a-zA-Z0-9_]/', '', $processAlias) ?: 'p';
    $safe = array_values(array_unique(array_filter(array_map('intval', $ids), static fn (int $id): bool => $id > 0)));
    if ($safe === []) {
        return ' AND 1=0 ';
    }

    return ' AND ' . $a . '.id IN (' . implode(',', $safe) . ') ';
}

function formulaMaintenanceBuildScopeProcessSql(PDO $pdo, int $companyId, bool $isGroupScope): string
{
    $class = formulaMaintenanceClassifyPayrollProcessIds($pdo, $companyId);
    if ($isGroupScope) {
        $sql = dcSqlGroupProcessFilter('p');
        if ($class['group'] !== []) {
            $sql .= formulaMaintenanceSqlProcessIdInList($class['group'], 'p');
        }

        return $sql;
    }

    $sql = " AND (
        UPPER(TRIM(p.process_id)) NOT IN ('SALARY', 'BONUS')";
    if ($class['subsidiary'] !== []) {
        $sql .= ' OR p.id IN (' . implode(',', $class['subsidiary']) . ')';
    }
    $sql .= ') ';

    return $sql;
}

function formulaMaintenanceResolveScopedPayrollProcessId(
    PDO $pdo,
    int $companyId,
    string $processCode,
    bool $isGroupScope
): ?int {
    $code = strtoupper(trim($processCode));
    if (!in_array($code, ['SALARY', 'BONUS'], true)) {
        return null;
    }
    $class = formulaMaintenanceClassifyPayrollProcessIds($pdo, $companyId);
    $pool = $isGroupScope ? $class['group'] : $class['subsidiary'];
    if ($pool === []) {
        return null;
    }
    $stmt = $pdo->prepare("
        SELECT id FROM process
        WHERE company_id = ? AND id IN (" . implode(',', $pool) . ")
          AND UPPER(TRIM(process_id)) = ?
        ORDER BY id ASC
        LIMIT 1
    ");
    $stmt->execute([$companyId, $code]);
    $id = (int) ($stmt->fetchColumn() ?: 0);

    return $id > 0 ? $id : (int) $pool[0];
}

/**
 * Template rows: group ledger vs subsidiary company when scope_type column exists.
 */
function formulaMaintenanceSqlTemplateScopeFilter(bool $isGroupScope, int $scopeBindId = 0): string
{
    global $pdo;
    if (!isset($pdo) || !tenant_table_has_scope_columns($pdo, 'data_capture_templates')) {
        return '';
    }
    if ($isGroupScope) {
        if ($scopeBindId <= 0) {
            return " AND dct.scope_type = 'group' ";
        }

        return ' AND dct.scope_type = \'group\' AND dct.scope_id = ' . (int) $scopeBindId . ' ';
    }

    return " AND (dct.scope_type IS NULL OR TRIM(dct.scope_type) = '' OR dct.scope_type = 'company') ";
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
    $requestedViewGroup = dcNormalizeGroupId($params['view_group'] ?? $params['group_id'] ?? '');

    if ($hasExplicitScope) {
        $scopeResolved = resolveDataCaptureRequestScope($pdo, $params);
        if ($scopeHint === 'company') {
            $scopeResolved['is_group_scope'] = false;
        } elseif ($scopeHint === 'group') {
            $scopeResolved['is_group_scope'] = true;
        }
        $finalizeParams = $params;
        if ($scopeHint === 'group' || !empty($scopeResolved['is_group_scope'])) {
            unset($finalizeParams['company_id']);
            if (!isset($finalizeParams['group_aggregate']) || trim((string) $finalizeParams['group_aggregate']) === '') {
                $finalizeParams['group_aggregate'] = '1';
            }
        }
        $scopeCtx = dcFinalizeCaptureMaintenanceScope($pdo, $scopeResolved, $finalizeParams);
        $companyId = (int) $scopeCtx['company_id'];
        $isGroupScope = (bool) $scopeCtx['is_group_scope'];
        $scopeProcessSql = formulaMaintenanceBuildScopeProcessSql($pdo, $companyId, $isGroupScope);
        if ((string) ($scopeCtx['scope_company_sql'] ?? '') !== '') {
            $scopeProcessSql .= dcSqlCaptureOnGroupEntityCompany('dct');
        }
        if (!$isGroupScope) {
            $scopeProcessSql .= dcSqlCaptureOnSubsidiaryCompany('dct');
        }
        dcAssertUserCanAccessCompany(
            $pdo,
            $companyId,
            $requestedViewGroup !== '' ? $requestedViewGroup : null
        );

        return [
            'company_id' => $companyId,
            'is_group_scope' => $isGroupScope,
            'scope_process_sql' => $scopeProcessSql,
        ];
    }

    if (gc_is_group_login() || isset($params['group_id']) || isset($params['view_group'])) {
        $companyId = tx_resolve_request_company_id($pdo, $params);
        $isGroupScope = false;
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

    $scopeProcessSql = formulaMaintenanceBuildScopeProcessSql($pdo, $companyId, $isGroupScope)
        . ($isGroupScope ? '' : dcSqlCaptureOnSubsidiaryCompany('dct'));

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
 * Resolve process.id by code; group vs subsidiary SALARY/BONUS on the same company_id.
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
    if (in_array($code, ['SALARY', 'BONUS'], true)) {
        return formulaMaintenanceResolveScopedPayrollProcessId($pdo, $companyId, $code, $isGroupScope);
    }
    if ($isGroupScope) {
        return null;
    }
    $stmt = $pdo->prepare("
        SELECT id FROM process
        WHERE company_id = ? AND UPPER(TRIM(process_id)) = ?
          AND UPPER(TRIM(process_id)) NOT IN ('SALARY', 'BONUS')
        ORDER BY id ASC
        LIMIT 1
    ");
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
        $stmt = $pdo->prepare(
            'SELECT UPPER(TRIM(process_id)) FROM process WHERE id = ? AND company_id = ? LIMIT 1'
        );
        $stmt->execute([$processId, $companyId]);
        $code = strtoupper(trim((string) ($stmt->fetchColumn() ?: '')));
        if ($code === '') {
            throw new Exception('Process not found for scope');
        }
        if (in_array($code, ['SALARY', 'BONUS'], true)) {
            $mapped = formulaMaintenanceResolveScopedPayrollProcessId($pdo, $companyId, $code, $isGroupScope);
            if ($mapped === null || $mapped <= 0) {
                return ['process_id' => null, 'legacy_code' => $code];
            }

            return ['process_id' => $mapped, 'legacy_code' => null];
        }
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
 * SQL JOIN process + template binding; scope-aware when multiple SALARY rows share one company_id.
 */
function formulaMaintenanceSqlTemplateProcessJoin(
    PDO $pdo,
    int $companyId,
    ?int $processIdFilter = null,
    bool $isGroupScope = false
): string {
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

    $class = formulaMaintenanceClassifyPayrollProcessIds($pdo, $companyId);
    $pool = $isGroupScope ? $class['group'] : $class['subsidiary'];
    $poolSql = '1=0';
    if ($pool !== []) {
        $poolSql = 'p2.id IN (' . implode(',', array_map('intval', $pool)) . ')';
    }

    return "INNER JOIN process p ON p.company_id = dct.company_id
        AND (
            (dct.process_id REGEXP '^[0-9]+$' AND p.id = CAST(dct.process_id AS UNSIGNED))
            OR (
                dct.process_id NOT REGEXP '^[0-9]+$'
                AND UPPER(TRIM(dct.process_id)) = UPPER(TRIM(p.process_id))
                AND (
                    UPPER(TRIM(dct.process_id)) NOT IN ('SALARY', 'BONUS')
                    OR p.id = (
                        SELECT p2.id
                        FROM process p2
                        WHERE p2.company_id = dct.company_id
                          AND UPPER(TRIM(p2.process_id)) = UPPER(TRIM(dct.process_id))
                          AND {$poolSql}
                        ORDER BY p2.id ASC
                        LIMIT 1
                    )
                )
            )
        )";
}
