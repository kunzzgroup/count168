<?php
/**
 * Shared scope helpers for Data Capture / Summary / submitted-process APIs.
 */

require_once __DIR__ . '/../reports/report_scope_common.php';

function dcNormalizeGroupId(?string $groupId): string
{
    return reportNormalizeGroupId($groupId);
}

function dcIsGroupScopeHint(array $resolved): bool
{
    $hint = strtolower(trim((string) ($resolved['report_scope_hint'] ?? '')));
    if ($hint === 'group') {
        return true;
    }
    $groupId = dcNormalizeGroupId($resolved['group_id'] ?? '');
    if ($groupId === '') {
        return false;
    }
    $companyId = (int) ($resolved['company_id'] ?? 0);
    if ($companyId <= 0) {
        return true;
    }
    global $pdo;
    if (!isset($pdo)) {
        return false;
    }
    $stmt = $pdo->prepare('SELECT company_id FROM company WHERE id = ? LIMIT 1');
    $stmt->execute([$companyId]);
    $code = strtoupper(trim((string) ($stmt->fetchColumn() ?: '')));
    return $code !== '' && $code === $groupId;
}

/**
 * SQL fragment restricting to group-only processes (SALARY / BONUS).
 */
function dcSqlGroupProcessFilter(string $processAlias = 'p'): string
{
    $a = preg_replace('/[^a-zA-Z0-9_]/', '', $processAlias) ?: 'p';
    return " AND UPPER(TRIM({$a}.process_id)) IN ('SALARY', 'BONUS') ";
}

/**
 * SQL fragment excluding group-only processes from company scope.
 */
function dcSqlCompanyProcessFilter(string $processAlias = 'p'): string
{
    $a = preg_replace('/[^a-zA-Z0-9_]/', '', $processAlias) ?: 'p';
    return " AND UPPER(TRIM({$a}.process_id)) NOT IN ('SALARY', 'BONUS') ";
}

/**
 * @param array<string, mixed> $params GET/POST merged params
 * @return array{company_id: int, group_id: string, report_scope_hint: string, is_group_scope: bool, request_params: array<string, mixed>}
 */
function resolveDataCaptureRequestScope(PDO $pdo, array $params): array
{
    $resolved = resolveReportRequestCompanyScope($pdo, $params);
    $isGroupScope = dcIsGroupScopeHint($resolved);
    if (($resolved['report_scope_hint'] ?? '') !== 'group' && $isGroupScope) {
        $resolved['report_scope_hint'] = 'group';
    }
    return [
        'company_id' => (int) $resolved['company_id'],
        'group_id' => (string) ($resolved['group_id'] ?? ''),
        'report_scope_hint' => (string) ($resolved['report_scope_hint'] ?? ''),
        'is_group_scope' => $isGroupScope,
        'request_params' => $resolved['request_params'] ?? $params,
    ];
}

function dcRequestHasExplicitScope(array $params): bool
{
    $scopeHint = strtolower(trim((string) ($params['report_scope'] ?? $params['capture_scope'] ?? '')));
    if ($scopeHint === 'group' || $scopeHint === 'company') {
        return true;
    }
    $groupId = dcNormalizeGroupId($params['group_id'] ?? '');
    if ($groupId !== '' && trim((string) ($params['company_id'] ?? '')) === '') {
        return true;
    }
    return false;
}

/**
 * Resolve process.id for SALARY/BONUS under scoped company.
 */
function dcResolveProcessIdByCode(PDO $pdo, int $companyId, string $processCode, bool $groupScope): ?int
{
    $code = strtoupper(trim($processCode));
    if ($code === '') {
        return null;
    }
    if ($groupScope && !in_array($code, ['SALARY', 'BONUS'], true)) {
        return null;
    }
    if (!$groupScope && in_array($code, ['SALARY', 'BONUS'], true)) {
        return null;
    }
    $sql = 'SELECT id FROM process WHERE company_id = ? AND UPPER(TRIM(process_id)) = ?';
    if ($groupScope) {
        $sql .= " AND UPPER(TRIM(process_id)) IN ('SALARY', 'BONUS')";
    } else {
        $sql .= " AND UPPER(TRIM(process_id)) NOT IN ('SALARY', 'BONUS')";
    }
    $sql .= ' LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId, $code]);
    $id = (int) ($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : null;
}

function dcCompanyGroupId(PDO $pdo, int $companyId): string
{
    $stmt = $pdo->prepare('SELECT UPPER(TRIM(COALESCE(group_id, ""))) FROM company WHERE id = ? LIMIT 1');
    $stmt->execute([$companyId]);
    return dcNormalizeGroupId((string) ($stmt->fetchColumn() ?: ''));
}

function dcFirstCurrencyIdForCompany(PDO $pdo, int $companyId): ?int
{
    $stmt = $pdo->prepare('SELECT id FROM currency WHERE company_id = ? ORDER BY id ASC LIMIT 1');
    $stmt->execute([$companyId]);
    $id = (int) ($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : null;
}

function dcFirstCurrencyIdInGroup(PDO $pdo, string $groupId): ?int
{
    $g = dcNormalizeGroupId($groupId);
    if ($g === '') {
        return null;
    }
    $stmt = $pdo->prepare("
        SELECT cur.id
        FROM currency cur
        INNER JOIN company c ON c.id = cur.company_id
        WHERE UPPER(TRIM(COALESCE(c.group_id, ''))) = ?
        ORDER BY cur.id ASC
        LIMIT 1
    ");
    $stmt->execute([$g]);
    $id = (int) ($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : null;
}

/**
 * @return array<string, mixed>|null
 */
function dcFindSiblingGroupProcessRow(PDO $pdo, string $groupId, string $processCode): ?array
{
    $g = dcNormalizeGroupId($groupId);
    $code = strtoupper(trim($processCode));
    if ($g === '' || $code === '') {
        return null;
    }
    $stmt = $pdo->prepare("
        SELECT p.id, p.currency_id, p.description_id, p.remove_word, p.replace_word_from,
               p.replace_word_to, p.remark, p.company_id AS source_company_id
        FROM process p
        INNER JOIN company c ON c.id = p.company_id
        WHERE UPPER(TRIM(COALESCE(c.group_id, ''))) = ?
          AND TRIM(COALESCE(c.company_id, '')) <> ''
          AND UPPER(TRIM(c.company_id)) <> ?
          AND UPPER(TRIM(p.process_id)) = ?
          AND p.status = 'active'
        ORDER BY p.id ASC
        LIMIT 1
    ");
    $stmt->execute([$g, $g, $code]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * @return array{created_by: ?int, created_by_type: string, created_by_owner_id: ?int}
 */
function dcCaptureCreatedByFields(): array
{
    if (!empty($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner') {
        return [
            'created_by' => null,
            'created_by_type' => 'owner',
            'created_by_owner_id' => isset($_SESSION['owner_id']) ? (int) $_SESSION['owner_id'] : (isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null),
        ];
    }
    $uid = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
    return [
        'created_by' => $uid,
        'created_by_type' => 'user',
        'created_by_owner_id' => null,
    ];
}

function dcAllDayIds(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT id FROM day ORDER BY id ASC');
    $ids = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $ids[] = $id;
        }
    }
    return $ids;
}

function dcDayIdsForProcess(PDO $pdo, int $processId): array
{
    $stmt = $pdo->prepare('SELECT day_id FROM process_day WHERE process_id = ? ORDER BY day_id ASC');
    $stmt->execute([$processId]);
    $ids = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $id = (int) ($row['day_id'] ?? 0);
        if ($id > 0) {
            $ids[] = $id;
        }
    }
    return $ids;
}

function dcInsertProcessDays(PDO $pdo, int $processId, array $dayIds): void
{
    if ($processId <= 0 || empty($dayIds)) {
        return;
    }
    $stmt = $pdo->prepare('INSERT INTO process_day (process_id, day_id) VALUES (?, ?)');
    foreach ($dayIds as $dayId) {
        $stmt->execute([$processId, (int) $dayId]);
    }
}

function dcCopyTemplatesToProcess(PDO $pdo, int $companyId, int $targetProcessId, int $sourceProcessId): void
{
    if ($targetProcessId <= 0 || $sourceProcessId <= 0) {
        return;
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM data_capture_templates WHERE process_id = ? AND company_id = ?');
    $stmt->execute([$targetProcessId, $companyId]);
    if ((int) $stmt->fetchColumn() > 0) {
        return;
    }
    $src = $pdo->prepare('SELECT * FROM data_capture_templates WHERE process_id = ? LIMIT 500');
    $src->execute([$sourceProcessId]);
    $templates = $src->fetchAll(PDO::FETCH_ASSOC);
    if (empty($templates)) {
        return;
    }
    $sql = 'INSERT INTO data_capture_templates (
        company_id, process_id, data_capture_id, row_index, sub_order,
        id_product, product_type, formula_variant, parent_id_product,
        template_key, description, account_id, account_display, currency_id, currency_display,
        source_columns, formula_operators, source_percent, enable_source_percent,
        input_method, enable_input_method, batch_selection, columns_display, formula_display,
        last_source_value, last_processed_amount, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())';
    $ins = $pdo->prepare($sql);
    foreach ($templates as $t) {
        try {
            $ins->execute([
                $companyId,
                $targetProcessId,
                $t['data_capture_id'] ?? null,
                $t['row_index'] ?? null,
                isset($t['sub_order']) && $t['sub_order'] !== '' ? $t['sub_order'] : null,
                $t['id_product'] ?? '',
                $t['product_type'] ?? 'main',
                isset($t['formula_variant']) ? (int) $t['formula_variant'] : 1,
                $t['parent_id_product'] ?? null,
                $t['template_key'] ?? '',
                $t['description'] ?? null,
                $t['account_id'] ?? 0,
                $t['account_display'] ?? null,
                $t['currency_id'] ?? null,
                $t['currency_display'] ?? null,
                $t['source_columns'] ?? null,
                $t['formula_operators'] ?? null,
                isset($t['source_percent']) && $t['source_percent'] !== '' ? $t['source_percent'] : '1',
                isset($t['enable_source_percent']) ? (int) $t['enable_source_percent'] : 1,
                $t['input_method'] ?? null,
                isset($t['enable_input_method']) ? (int) $t['enable_input_method'] : 0,
                $t['batch_selection'] ?? null,
                $t['columns_display'] ?? null,
                $t['formula_display'] ?? null,
                $t['last_source_value'] ?? null,
                $t['last_processed_amount'] ?? null,
            ]);
        } catch (Exception $e) {
            error_log('dcCopyTemplatesToProcess: ' . $e->getMessage());
        }
    }
}

/**
 * Create SALARY/BONUS on group entity when missing (clone settings from a subsidiary when possible).
 */
function dcCreateGroupProcessByCode(PDO $pdo, int $companyId, string $processCode, ?string $groupId = null): ?int
{
    $code = strtoupper(trim($processCode));
    if (!in_array($code, ['SALARY', 'BONUS'], true)) {
        return null;
    }

    $g = dcNormalizeGroupId($groupId ?? '');
    if ($g === '') {
        $g = dcCompanyGroupId($pdo, $companyId);
    }

    $sibling = $g !== '' ? dcFindSiblingGroupProcessRow($pdo, $g, $code) : null;
    $currencyId = isset($sibling['currency_id']) ? (int) $sibling['currency_id'] : 0;
    if ($currencyId <= 0) {
        $currencyId = (int) (dcFirstCurrencyIdForCompany($pdo, $companyId) ?? 0);
    }
    if ($currencyId <= 0 && $g !== '') {
        $currencyId = (int) (dcFirstCurrencyIdInGroup($pdo, $g) ?? 0);
    }
    if ($currencyId <= 0) {
        return null;
    }

    $created = dcCaptureCreatedByFields();
    $descriptionId = isset($sibling['description_id']) && $sibling['description_id'] !== ''
        ? (int) $sibling['description_id']
        : null;
    if ($descriptionId !== null && $descriptionId <= 0) {
        $descriptionId = null;
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("
            INSERT INTO process (
                process_id, description_id, currency_id, remove_word, replace_word_from, replace_word_to, remark,
                created_by, created_by_type, created_by_owner_id, dts_created, company_id, sync_source_process_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $code,
            $descriptionId,
            $currencyId,
            $sibling['remove_word'] ?? null,
            $sibling['replace_word_from'] ?? null,
            $sibling['replace_word_to'] ?? null,
            $sibling['remark'] ?? null,
            $created['created_by'],
            $created['created_by_type'],
            $created['created_by_owner_id'],
            date('Y-m-d H:i:s'),
            $companyId,
            isset($sibling['id']) ? (int) $sibling['id'] : null,
        ]);
        $newId = (int) $pdo->lastInsertId();
        if ($newId <= 0) {
            $pdo->rollBack();
            return null;
        }

        $dayIds = [];
        if (!empty($sibling['id'])) {
            $dayIds = dcDayIdsForProcess($pdo, (int) $sibling['id']);
        }
        if (empty($dayIds)) {
            $dayIds = dcAllDayIds($pdo);
        }
        dcInsertProcessDays($pdo, $newId, $dayIds);

        if (!empty($sibling['id'])) {
            dcCopyTemplatesToProcess($pdo, $companyId, $newId, (int) $sibling['id']);
        }

        $pdo->commit();
        return $newId;
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('dcCreateGroupProcessByCode: ' . $e->getMessage());
        return null;
    }
}

/**
 * Resolve process.id; for group SALARY/BONUS auto-create on entity company when missing.
 */
function dcEnsureProcessIdByCode(PDO $pdo, int $companyId, string $processCode, bool $groupScope, ?string $groupId = null): ?int
{
    $existing = dcResolveProcessIdByCode($pdo, $companyId, $processCode, $groupScope);
    if ($existing !== null) {
        return $existing;
    }
    if (!$groupScope) {
        return null;
    }
    return dcCreateGroupProcessByCode($pdo, $companyId, $processCode, $groupId);
}

/**
 * Ensure process.id belongs to company scope (group = SALARY/BONUS only).
 */
/**
 * Verify user may access company_id (including group entity when mapped to a subsidiary in that group).
 *
 * @throws Exception
 */
function dcAssertUserCanAccessCompany(PDO $pdo, int $companyId, ?string $viewGroup = null): void
{
    if ($companyId <= 0) {
        throw new Exception('缺少公司信息');
    }

    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) {
        throw new Exception('用户未登录');
    }

    $vg = dcNormalizeGroupId($viewGroup ?? '');
    $sessionCompanyId = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : 0;
    if ($sessionCompanyId > 0 && $sessionCompanyId === $companyId) {
        return;
    }

    if (gc_is_group_login()) {
        if (gc_session_can_access_company_id($pdo, $companyId, $vg !== '' ? $vg : null)) {
            return;
        }
        throw new Exception('无权限访问该公司');
    }

    $role = strtolower((string) ($_SESSION['role'] ?? ''));
    $userType = strtolower((string) ($_SESSION['user_type'] ?? ''));

    if ($role === 'owner' || $userType === 'owner') {
        $ownerId = (int) ($_SESSION['owner_id'] ?? $userId);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?');
        $stmt->execute([$companyId, $ownerId]);
        if ((int) $stmt->fetchColumn() > 0) {
            return;
        }
        throw new Exception('无权限访问该公司');
    }

    if ($userType === 'member') {
        $memberId = function_exists('member_session_canonical_account_id')
            ? member_session_canonical_account_id()
            : $userId;
        $stmt = $pdo->prepare('
            SELECT COUNT(*) FROM account_company ac
            WHERE ac.account_id = ? AND ac.company_id = ?
        ');
        $stmt->execute([$memberId, $companyId]);
        if ((int) $stmt->fetchColumn() > 0) {
            return;
        }
        if ($vg !== '' && gc_session_can_access_company_id($pdo, $companyId, $vg)) {
            return;
        }
        throw new Exception('无权限访问该公司');
    }

    $mapStmt = $pdo->prepare('SELECT COUNT(*) FROM user_company_map WHERE user_id = ? AND company_id = ?');
    $mapStmt->execute([$userId, $companyId]);
    if ((int) $mapStmt->fetchColumn() > 0) {
        return;
    }

    if ($vg !== '') {
        $entityId = tx_resolve_group_entity_company_id($pdo, $vg);
        if ($entityId > 0 && $companyId === $entityId) {
            $grpStmt = $pdo->prepare("
                SELECT COUNT(*)
                FROM user_company_map ucm
                INNER JOIN company c ON c.id = ucm.company_id
                WHERE ucm.user_id = ?
                  AND UPPER(TRIM(COALESCE(c.group_id, ''))) = ?
            ");
            $grpStmt->execute([$userId, $vg]);
            if ((int) $grpStmt->fetchColumn() > 0) {
                return;
            }
        }
        if (gc_session_can_access_company_id($pdo, $companyId, $vg)) {
            return;
        }
    }

    $ownerFallback = $pdo->prepare('SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?');
    $ownerFallback->execute([$companyId, $userId]);
    if ((int) $ownerFallback->fetchColumn() > 0) {
        return;
    }

    throw new Exception('无权限访问该公司');
}

function dcAssertProcessIdInCaptureScope(PDO $pdo, int $processId, int $companyId, bool $groupScope): void
{
    if ($processId <= 0 || $companyId <= 0) {
        throw new Exception('Invalid process for scope');
    }
    $stmt = $pdo->prepare('SELECT UPPER(TRIM(process_id)) FROM process WHERE id = ? AND company_id = ? LIMIT 1');
    $stmt->execute([$processId, $companyId]);
    $code = strtoupper(trim((string) ($stmt->fetchColumn() ?: '')));
    if ($code === '') {
        throw new Exception('Process not found for scope');
    }
    if ($groupScope && !in_array($code, ['SALARY', 'BONUS'], true)) {
        throw new Exception('Invalid process for group scope');
    }
    if (!$groupScope && in_array($code, ['SALARY', 'BONUS'], true)) {
        throw new Exception('Invalid process for company scope');
    }
}
