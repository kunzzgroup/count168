<?php
/**
 * Formula Maintenance Search API - 搜索 data_capture_templates
 * 路径: api/formula_maintenance/search_api.php
 */

session_start();
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
 * 从请求中解析并验证 company_id
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
        throw new Exception('用户未登录或缺少公司信息');
    }
    return (int)$_SESSION['company_id'];
}

/**
 * 根据流程名称获取 process_id 筛选条件（空字符串表示不过滤）
 */
function getProcessIdFilter(PDO $pdo, string $processName, int $companyId) {
    if ($processName === '') {
        return '';
    }
    $stmt = $pdo->prepare("SELECT id FROM data_capture_process WHERE company_id = ? AND process_name = ?");
    $stmt->execute([$companyId, $processName]);
    $id = $stmt->fetchColumn();
    return $id !== false ? (string)$id : '';
}

/**
 * 执行搜索并返回结果列表
 */
function fetchFormulaSearch(PDO $pdo, int $companyId, string $search, string $processFilter) {
    $sql = "SELECT t.id, t.company_id, t.process_id, t.template_name, t.template_type, t.template_content, t.is_synced, t.created_at, t.updated_at, p.process_name
            FROM data_capture_templates t
            LEFT JOIN data_capture_process p ON t.process_id = p.id AND p.company_id = t.company_id
            WHERE t.company_id = ?";
    $params = [$companyId];
    if ($search !== '') {
        $sql .= " AND (t.template_name LIKE ? OR t.template_content LIKE ?)";
        $like = '%' . $search . '%';
        $params[] = $like;
        $params[] = $like;
    }
    if ($processFilter !== '') {
        $sql .= " AND t.process_id = ?";
        $params[] = $processFilter;
    }
    $sql .= " ORDER BY t.updated_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }
    $companyId = getCompanyIdForRequest($pdo);
    $search = isset($_GET['search']) ? trim((string)$_GET['search']) : '';
    if ($search === '' && isset($_POST['search'])) {
        $search = trim((string)$_POST['search']);
    }
    $processName = isset($_GET['process_name']) ? trim((string)$_GET['process_name']) : '';
    if ($processName === '' && isset($_POST['process_name'])) {
        $processName = trim((string)$_POST['process_name']);
    }
    $processFilter = getProcessIdFilter($pdo, $processName, $companyId);

    $rows = fetchFormulaSearch($pdo, $companyId, $search, $processFilter);
    jsonResponse(true, 'success', ['list' => $rows]);
} catch (PDOException $e) {
    jsonResponse(false, '数据库错误: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    jsonResponse(false, $e->getMessage(), null, 400);
}
