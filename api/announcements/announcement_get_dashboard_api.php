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
    // 不依赖 status 列，兼容无 status 的旧表结构
    $sql = "SELECT 
                a.id,
                a.title,
                a.content,
                DATE_FORMAT(a.created_at, '%d/%m/%Y %H:%i:%s') as created_at,
                COALESCE(u.name, o.name) as created_by_name
            FROM announcements a
            LEFT JOIN user u ON a.created_by = u.id AND a.user_type = 'user'
            LEFT JOIN owner o ON a.created_by = o.id AND a.user_type = 'owner'
            WHERE a.company_code = 'C168'
            ORDER BY a.created_at DESC
            LIMIT ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$limit]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function formatDashboardRows(array $rows): array {
    $out = [];
    foreach ($rows as $row) {
        $out[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'] ?? '',
            'content' => $row['content'] ?? '',
            'created_at' => $row['created_at'] ?? '',
            'created_by' => $row['created_by_name'] ?? 'Unknown'
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
    $data = formatDashboardRows($rows);
    jsonResponse(true, '', $data);

} catch (PDOException $e) {
    error_log('Announcement get dashboard API DB error: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, 'Database error', null);
} catch (Throwable $e) {
    error_log('Announcement get dashboard API error: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, 'Server error', null);
}
