<?php
/**
 * Transaction Get Company Currencies API
 * 获取指定 company 的所有 currency 列表
 * 路径: api/transactions/get_company_currencies_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/../api_response.php';

header('Content-Type: application/json');

function resolveCompanyId(PDO $pdo): int
{
    if (isset($_GET['company_id']) && $_GET['company_id'] !== '') {
        $requested = (int) $_GET['company_id'];
        if ($requested <= 0) {
            throw new Exception('无效的 company_id');
        }

        if (gc_is_group_login()) {
            $viewGroup = isset($_GET['view_group']) ? trim((string) $_GET['view_group']) : null;
            if (!gc_session_can_access_company_id($pdo, $requested, $viewGroup)) {
                throw new Exception('无权访问该 company');
            }
            return $requested;
        }

        $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
        if ($userRole === 'owner') {
            $ownerId = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare('SELECT id FROM company WHERE id = ? AND owner_id = ?');
            $stmt->execute([$requested, $ownerId]);
            if ($stmt->fetchColumn()) {
                return $requested;
            }
            throw new Exception('无权访问该 company');
        }

        if (isset($_SESSION['company_id']) && (int) $_SESSION['company_id'] === $requested) {
            return $requested;
        }

        $ucm = $pdo->prepare('SELECT 1 FROM user_company_map WHERE user_id = ? AND company_id = ? LIMIT 1');
        $ucm->execute([$_SESSION['user_id'], $requested]);
        if ($ucm->fetchColumn()) {
            return $requested;
        }

        throw new Exception('无权访问该 company');
    }

    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }

    return (int) $_SESSION['company_id'];
}

function getCompanyCurrencies(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare('
        SELECT DISTINCT c.id, c.code
        FROM currency c
        WHERE c.company_id = ?
        ORDER BY c.id ASC
    ');
    $stmt->execute([$companyId]);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

try {
    if (!isset($_SESSION['user_id'])) {
        api_error('用户未登录', 401);
        exit;
    }
    $companyId = resolveCompanyId($pdo);
    $currencies = getCompanyCurrencies($pdo, $companyId);
    api_success($currencies);
} catch (PDOException $e) {
    api_error('数据库错误: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}
