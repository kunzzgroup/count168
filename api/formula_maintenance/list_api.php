<?php
/**
 * Formula Maintenance List API - 返回 data_capture_templates 作为公式维护数据源
 * 路径: api/formula_maintenance/list_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';

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
        if (!isset($_SESSION['company_id']) || (int)$_SESSION['company_id'] !== $requested) {
            throw new Exception('无权访问该公司');
        }
        return (int)$_SESSION['company_id'];
    }
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }
    return (int)$_SESSION['company_id'];
}

/**
 * 获取公式列表（含搜索、process 筛选），返回原始行
 * 直接 JOIN process 表，避免 GROUP BY 导致同一 process 代码下多条 process 行时只匹配 MIN(id)、
 * 其余模板在 Maintenance 不显示却在 Data Capture Summary 仍显示的问题。
 */
function fetchFormulaListRaw(PDO $pdo, int $companyId, string $search, string $processFilter) {
    $sql = "SELECT 
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
            INNER JOIN process p ON p.company_id = dct.company_id
                AND (
                    (dct.process_id REGEXP '^[0-9]+$' AND p.id = CAST(dct.process_id AS UNSIGNED))
                    OR (dct.process_id = p.process_id)
                )
            LEFT JOIN description d ON p.description_id = d.id
            LEFT JOIN account a ON dct.account_id = a.id
            LEFT JOIN currency c ON dct.currency_id = c.id
            WHERE dct.company_id = ?";
    $params = [$companyId];
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
 * Maintenance - Formula 列：符号公式 + Source Percent（Rate 乘子），如 $7*0.125
 * 若库中已存完整带 * 系数的式子，或乘子为 1，则不再重复拼接。
 */
function buildMaintenanceFormulaDisplay(array $row) {
    $formulaValue = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    if ($formulaValue === '') {
        $formulaValue = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    }
    if ($formulaValue === '') {
        return '';
    }
    $enable = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;
    $pct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    if (!$enable || $pct === '') {
        return $formulaValue;
    }
    if ($pct === '1' || $pct === '1.0' || $pct === '1.00') {
        return $formulaValue;
    }
    $suffix = '*' . $pct;
    $suffixLen = strlen($suffix);
    if ($suffixLen > 0 && strlen($formulaValue) >= $suffixLen && substr($formulaValue, -$suffixLen) === $suffix) {
        return $formulaValue;
    }
    // 末尾已是 * 数值（或简单分式）视为已含系数，避免 $7*0.125 再拼 *0.125
    if (preg_match('/\*\s*[0-9.\/()%]+\s*$/', $formulaValue)) {
        return $formulaValue;
    }
    return $formulaValue . $suffix;
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
        $sourceValue = $row['columns_display'] ?? $row['source_columns'] ?? '';
        // 符号公式 + Source Percent（与 Summary / 模板表一致），例如 $7*0.125
        $formulaValue = buildMaintenanceFormulaDisplay($row);
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

        // 只要「同一个 Process + Account + Currency + Product + 类型」，
        // 就视为同一条当前有效公式，只保留最新一条（id 最大），
        // 历史上旧公式仍保留在表里，但不会额外占一行，避免 Data Summary 25 条而 Maintenance - Formula 显示 26 条的情况。
        $keyParts = [
            strtolower(trim((string)$processDisplay)),
            strtolower(trim((string)$accountDisplay)),
            strtolower(trim((string)$currencyDisplay)),
            strtolower(trim((string)$product)),
            $productType,
        ];
        $dedupKey = implode('|', $keyParts);

        $currentId = isset($row['id']) ? (int)$row['id'] : 0;
        if (!isset($displayRowsByKey[$dedupKey])) {
            $displayRowsByKey[$dedupKey] = [
                'id' => $currentId,
                'process' => $processDisplay,
                'account' => $accountDisplay,
                'account_id' => $row['account_id'],
                'account_name' => $row['account_name'] ?? '',
                'currency' => $currencyDisplay,
                'source' => $sourceValue,
                'product' => $product,
                'input_method' => $inputMethod,
                'formula' => $formulaValue,
                'description' => $description,
                'product_type' => $productType
            ];
        } else {
            // 同一个界面组合只保留最新一条，避免历史重复记录在列表中多占一行
            $existingId = (int)$displayRowsByKey[$dedupKey]['id'];
            if ($currentId > $existingId) {
                $displayRowsByKey[$dedupKey]['id'] = $currentId;
            }
        }
    }

    // 重新生成顺序号 no
    $data = [];
    $no = 1;
    foreach ($displayRowsByKey as $row) {
        $row['no'] = $no++;
        $row['id'] = (int)$row['id'];
        $data[] = $row;
    }
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
    jsonResponse(false, '数据库错误: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    jsonResponse(false, $e->getMessage(), null, 400);
}