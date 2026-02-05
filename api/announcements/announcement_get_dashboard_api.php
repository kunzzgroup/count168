<?php
/**
 * 公告仪表盘 API：获取活跃公告（供仪表盘展示）
 * 路径: api/announcements/announcement_get_dashboard_api.php
 */
header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../config.php';
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server config error', 'data' => null], JSON_UNESCAPED_UNICODE);
    exit;
}

function fetchActiveAnnouncementsForDashboard(PDO $pdo, int $limit = 10): array {
    // 仅查 announcements 表最基础列，兼容无 user_type/status 的旧表
    $sql = "SELECT id, title, content,
                DATE_FORMAT(created_at, '%d/%m/%Y %H:%i:%s') as created_at,
                created_by
            FROM announcements
            WHERE company_code = 'C168'
            ORDER BY created_at DESC
            LIMIT ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$limit]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function formatDashboardRows(PDO $pdo, array $rows): array {
    $out = [];
    foreach ($rows as $row) {
        $createdBy = '—';
        if (!empty($row['created_by'])) {
            try {
                $stmt = $pdo->prepare("SELECT name FROM user WHERE id = ?");
                $stmt->execute([$row['created_by']]);
                $name = $stmt->fetchColumn();
                if ($name === false || $name === null) {
                    $stmt = $pdo->prepare("SELECT name FROM owner WHERE id = ?");
                    $stmt->execute([$row['created_by']]);
                    $name = $stmt->fetchColumn();
                }
                if ($name !== false && $name !== null) {
                    $createdBy = $name;
                }
            } catch (Throwable $e) {
                // 忽略单条查名失败
            }
        }
        $out[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'] ?? '',
            'content' => $row['content'] ?? '',
            'created_at' => $row['created_at'] ?? '',
            'created_by' => $createdBy
        ];
    }
    return $out;
}

function jsonResponse(bool $success, string $message, $data = null): void {
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonResponse(false, 'User not logged in', null);
    }

    $rows = fetchActiveAnnouncementsForDashboard($pdo, 10);
    $data = formatDashboardRows($pdo, $rows);
    jsonResponse(true, '', $data);

} catch (PDOException $e) {
    error_log('Announcement get dashboard API DB error: ' . $e->getMessage());
    // 表不存在或列错误时返回空列表，避免侧栏报 500
    jsonResponse(true, '', []);
} catch (Throwable $e) {
    error_log('Announcement get dashboard API error: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, 'Server error', null);
}
