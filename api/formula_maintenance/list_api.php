<?php
/**
 * Formula Maintenance List API - 返回 data_capture_templates 作为公式维护数据源
 * 路径: api/formula_maintenance/list_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/formula_fields_helper.php';

function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode([
        'success' => (bool) $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * 从请求（GET/POST）中解析并验证 company_id
 */
function getCompanyIdForRequest(PDO $pdo) {
    $requested = isset($_GET['company_id']) ? trim($_GET['company_id']) : '';
    if ($requested === '' && isset($_POST['company_id'])) {
        $requested = trim((string)$_POST['company_id']);
    }
    if ($requested !== '') {
        $requested = (int)$requested;
        $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
        if ($userRole === 'owner') {
            $owner_id = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
            $stmt->execute([$requested, $owner_id]);
            if ($stmt->fetchColumn()) {
                return $requested;
            }
            throw new Exception('无权访问该公司');
        }
        if (!maintenance_gate_non_owner_can_use_company($pdo, $requested)) {
            throw new Exception('无权访问该公司');
        }
        return $requested;
    }
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }
    return (int)$_SESSION['company_id'];
}

/**
 * 获取公式列表（含搜索、process 筛选），返回原始行。
 *
 * 每条 template 只关联一条 process 行：优先 numeric process_id → process.id 精确匹配，
 * 否则按 process.process_id 匹配并取 MIN(process.id)。
 * 避免同一 process 代码存在多条 process 行时 INNER JOIN 产生笛卡尔积，
 * 在 Process = Select All 时导致 IG 等大组公司内存/超时（HTTP 500）。
 */
function fetchFormulaListRaw(PDO $pdo, int $companyId, string $search, string $processFilter) {
    // 用单引号 PHP 字符串，避免 "^[0-9]+$" 里的 $ 在双引号中被误解析
    $numericProcessPattern = '^[0-9]+$';
    $processJoinOn = 'p2.company_id = dct_inner.company_id AND (
                    (dct_inner.process_id REGEXP \'' . $numericProcessPattern . '\' AND p2.id = CAST(dct_inner.process_id AS UNSIGNED))
                    OR (p2.process_id = dct_inner.process_id)
                )';

    $sql = 'SELECT 
                dct.id,
                dct.process_id,
                dct.id_product,
                dct.product_type,
                dct.parent_id_product,
                dct.account_id,
                dct.account_display,
                dct.currency_id,
                dct.currency_display,
                dct.columns_display,
                dct.source_columns,
                dct.input_method,
                dct.formula_display,
                dct.formula_operators,
                dct.last_source_value,
                dct.source_percent,
                dct.enable_source_percent,
                dct.description,
                p.process_id AS process_code,
                p.description_id,
                d.name AS description_name,
                a.account_id AS account_code,
                a.name AS account_name,
                c.code AS currency_code
            FROM data_capture_templates dct
            INNER JOIN (
                SELECT
                    dct_inner.id AS template_id,
                    COALESCE(
                        MIN(CASE
                            WHEN dct_inner.process_id REGEXP \'' . $numericProcessPattern . '\'
                                 AND p2.id = CAST(dct_inner.process_id AS UNSIGNED)
                            THEN p2.id
                            ELSE NULL
                        END),
                        MIN(p2.id)
                    ) AS picked_process_id
                FROM data_capture_templates dct_inner
                INNER JOIN process p2 ON ' . $processJoinOn . '
                WHERE dct_inner.company_id = ?
                GROUP BY dct_inner.id
            ) tpl_proc ON tpl_proc.template_id = dct.id
            INNER JOIN process p ON p.id = tpl_proc.picked_process_id
            LEFT JOIN description d ON p.description_id = d.id
            LEFT JOIN account a ON dct.account_id = a.id
            LEFT JOIN currency c ON dct.currency_id = c.id
            WHERE dct.company_id = ?';
    $params = [$companyId, $companyId];
    if ($processFilter !== '') {
        $sql .= " AND p.process_id = ?";
        $params[] = $processFilter;
    }
    if ($search !== '') {
        $like = '%' . $search . '%';
        $sql .= " AND (
            dct.description LIKE ?
            OR dct.formula_display LIKE ?
            OR dct.columns_display LIKE ?
            OR dct.source_columns LIKE ?
            OR dct.id_product LIKE ?
            OR COALESCE(a.account_id, dct.account_display) LIKE ?
            OR a.name LIKE ?
            OR d.name LIKE ?
            OR p.process_id LIKE ?
        )";
        $params = array_merge($params, [$like, $like, $like, $like, $like, $like, $like, $like, $like]);
    }
    $sql .= " ORDER BY p.process_id ASC, dct.id ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 将原始行转换为前端需要的格式（no, process, account, source, formula 等）
 */
function mapRowsToDisplay(array $rows) {
    // 以「界面上能看到的字段」为维度去重，
    // 确保同一 Process 下，Maintenance - Formula 的可见行数与 Data Summary 一致，
    // 但不影响底层 data_capture_templates 中的所有记录（仅列表展示去重）。
    $displayRowsByKey = [];
    foreach ($rows as $row) {
        $sourceRef = $row['columns_display'] ?? $row['source_columns'] ?? '';
        list($base, $sourcePct, $sourceEn) = resolveTemplateFormulaBaseAndPercent($row);
        $sourceDisplay = formatSourcePercentForMaintenanceList($sourcePct);
        $formulaDisplayParen = buildFormulaDisplayParenFromParts($base, $sourcePct, $sourceEn);
        $formulaEdit = buildFormulaEditFromRow($row);
        $processCode = $row['process_code'] ?? '';
        $descriptionName = $row['description_name'] ?? '';
        $processDisplay = $processCode;
        if ($descriptionName !== '') {
            $processDisplay = $processCode . ' (' . $descriptionName . ')';
        }
        $accountDisplay = $row['account_code'] ?? ($row['account_display'] ?? '');
        $currencyDisplay = $row['currency_code'] ?? ($row['currency_display'] ?? '');
        $product = $row['id_product'] ?? '';
        $inputMethod = $row['input_method'] ?? '';
        $description = $row['description'] ?? '';
        $productType = $row['product_type'] ?? 'main';
        // description 必须参与去重 key：主产品与「红股%」等子说明共用同一 id_product、同 account 时，
        // 若省略则会被合并为一条，导致 Maintenance 行数少于 Data Capture Summary（例如少显示第 4 行）。
        $descriptionKey = strtolower(trim((string) $description));

        // 只要「同一个 Process + Account + Currency + Product + 类型 + 说明」，
        // 就视为同一条当前有效公式，只保留最新一条（id 最大），
        // 历史上旧公式仍保留在表里，但不会额外占一行，避免 Data Summary 25 条而 Maintenance - Formula 显示 26 条的情况。
        $keyParts = [
            strtolower(trim((string)$processDisplay)),
            strtolower(trim((string)$accountDisplay)),
            strtolower(trim((string)$currencyDisplay)),
            strtolower(trim((string)$product)),
            $productType,
            $descriptionKey,
        ];
        $dedupKey = implode('|', $keyParts);

        $currentId = isset($row['id']) ? (int)$row['id'] : 0;
        $currentScore = scoreTemplateRowForMaintenanceDedup($row);
        if (!isset($displayRowsByKey[$dedupKey])) {
            $displayRowsByKey[$dedupKey] = [
                'id' => $currentId,
                '_dedup_score' => $currentScore,
                'process' => $processDisplay,
                'account' => $accountDisplay,
                'account_id' => $row['account_id'],
                'account_name' => $row['account_name'] ?? '',
                'currency' => $currencyDisplay,
                'source' => $sourceDisplay,
                'source_ref' => is_string($sourceRef) ? trim($sourceRef) : trim((string) $sourceRef),
                'product' => $product,
                'input_method' => $inputMethod,
                'formula' => $formulaDisplayParen,
                'formula_edit' => $formulaEdit,
                'description' => $description,
                'product_type' => $productType
            ];
        } else {
            $existingScore = (int)($displayRowsByKey[$dedupKey]['_dedup_score'] ?? 0);
            $existingId = (int)$displayRowsByKey[$dedupKey]['id'];
            $shouldReplace = $currentScore > $existingScore
                || ($currentScore === $existingScore && $currentId > $existingId);
            if ($shouldReplace) {
                $displayRowsByKey[$dedupKey]['id'] = $currentId;
                $displayRowsByKey[$dedupKey]['_dedup_score'] = $currentScore;
                $displayRowsByKey[$dedupKey]['formula'] = $formulaDisplayParen;
                $displayRowsByKey[$dedupKey]['formula_edit'] = $formulaEdit;
                $displayRowsByKey[$dedupKey]['source'] = $sourceDisplay;
                $displayRowsByKey[$dedupKey]['source_ref'] = is_string($sourceRef) ? trim($sourceRef) : trim((string) $sourceRef);
                $displayRowsByKey[$dedupKey]['input_method'] = $inputMethod;
                $displayRowsByKey[$dedupKey]['description'] = $description;
                $displayRowsByKey[$dedupKey]['account'] = $accountDisplay;
                $displayRowsByKey[$dedupKey]['account_id'] = $row['account_id'];
                $displayRowsByKey[$dedupKey]['account_name'] = $row['account_name'] ?? '';
                $displayRowsByKey[$dedupKey]['currency'] = $currencyDisplay;
                $displayRowsByKey[$dedupKey]['product'] = $product;
            }
        }
    }

    // 重新生成顺序号 no
    $data = [];
    $no = 1;
    foreach ($displayRowsByKey as $row) {
        unset($row['_dedup_score']);
        $row['no'] = $no++;
        $row['id'] = (int)$row['id'];
        $data[] = $row;
    }
    applyPeerRowCoefficientInferenceToDisplayRows($data);
    return $data;
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }
    $companyId = getCompanyIdForRequest($pdo);
    $category = trim($_GET['category'] ?? $_GET['permission'] ?? '');
    $catUpper = $category !== '' ? strtoupper($category) : '';
    if (in_array($catUpper, ['LOAN', 'RATE', 'MONEY'], true)) {
        jsonResponse(true, 'success', ['list' => [], 'total' => 0]);
        exit;
    }

    $search = isset($_GET['search']) ? trim((string)$_GET['search']) : '';
    if ($search === '' && isset($_POST['search'])) {
        $search = trim((string)$_POST['search']);
    }
    $processFilter = isset($_GET['process']) ? trim((string)$_GET['process']) : '';
    if ($processFilter === '' && isset($_POST['process'])) {
        $processFilter = trim((string)$_POST['process']);
    }
    $rows = fetchFormulaListRaw($pdo, $companyId, $search, $processFilter);
    $list = mapRowsToDisplay($rows);
    jsonResponse(true, 'success', ['list' => $list, 'total' => count($list)]);
} catch (PDOException $e) {
    error_log('Formula list API PDO error: ' . $e->getMessage());
    jsonResponse(false, '数据库错误: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    jsonResponse(false, $e->getMessage(), null, 400);
} catch (Throwable $e) {
    error_log('Formula list API error: ' . $e->getMessage());
    jsonResponse(false, $e->getMessage(), null, 500);
}