<?php
/**
 * 与 processlist_api 一致：列表页可用 ?company_id= 切换公司，但 session 未必同步；
 * Accounting Due / dismiss 等须用同一有效 company_id，否则 bank_process 校验失败 → 移除 0 条。
 */

if (!function_exists('process_api_check_company_access')) {
    function process_api_check_company_access(PDO $pdo, int $requestedCompanyId): bool
    {
        if ($requestedCompanyId <= 0) {
            return false;
        }
        $currentUserId = $_SESSION['user_id'] ?? null;
        $currentUserRole = $_SESSION['role'] ?? '';
        if ($currentUserRole === 'owner') {
            $ownerId = $_SESSION['owner_id'] ?? $currentUserId;
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?');
            $stmt->execute([$requestedCompanyId, $ownerId]);
            return (int) $stmt->fetchColumn() > 0;
        }
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM user_company_map WHERE user_id = ? AND company_id = ?');
        $stmt->execute([$currentUserId, $requestedCompanyId]);
        return (int) $stmt->fetchColumn() > 0;
    }
}

if (!function_exists('process_api_resolve_effective_company_id')) {
    /**
     * GET 或 POST 的 company_id 通过权限校验时优先使用，否则回退 session。
     */
    function process_api_resolve_effective_company_id(PDO $pdo): int
    {
        $sessionId = (int) ($_SESSION['company_id'] ?? 0);
        $fromGet = (isset($_GET['company_id']) && $_GET['company_id'] !== '') ? (int) $_GET['company_id'] : 0;
        $fromPost = (isset($_POST['company_id']) && $_POST['company_id'] !== '') ? (int) $_POST['company_id'] : 0;
        $requested = $fromGet > 0 ? $fromGet : $fromPost;
        if ($requested > 0 && process_api_check_company_access($pdo, $requested)) {
            return $requested;
        }
        return $sessionId;
    }
}
