<?php
/**
 * Contra Inbox 长轮询（Manager+）
 * 客户端传入当前 pending 签名 sig；服务端在 timeout 内每 ~0.5s 检查，
 * 一旦有变化立即返回最新列表，实现跨设备近实时通知。
 * 路径: api/transactions/contra_inbox_wait_api.php
 */

session_start();
session_write_close();

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/contra_inbox_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Accel-Buffering: no');

@ini_set('zlib.output_compression', '0');
@ini_set('implicit_flush', '1');
while (ob_get_level() > 0) {
    @ob_end_clean();
}
@set_time_limit(40);

try {
    if (!isset($_SESSION['user_id'])) {
        api_error('请先登录', 401);
        exit;
    }
    $userRole = strtolower($_SESSION['role'] ?? '');
    $userType = strtolower($_SESSION['user_type'] ?? 'user');
    if ($userType === 'member' || !contraInboxIsManagerOrAboveRole($userRole)) {
        api_error('无权访问', 403);
        exit;
    }

    $companyId = contraInboxResolveCompanyId($pdo);
    $clientSig = isset($_GET['sig']) ? trim((string) $_GET['sig']) : '';
    $timeout = isset($_GET['timeout']) ? (int) $_GET['timeout'] : 25;
    if ($timeout < 5) {
        $timeout = 5;
    }
    if ($timeout > 28) {
        $timeout = 28;
    }

    if (!contraInboxTableHasColumn($pdo, 'transactions', 'approval_status')) {
        echo json_encode([
            'success' => true,
            'message' => '',
            'data' => [
                'items' => [],
                'sig' => sha1(''),
                'changed' => true,
                'waited_ms' => 0,
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $started = microtime(true);
    $deadline = $started + $timeout;
    $changed = false;
    $sig = contraInboxPendingSignature($pdo, $companyId);

    $sigMatches = static function (string $current, string $client): bool {
        return $client !== ''
            && strlen($current) === strlen($client)
            && hash_equals($current, $client);
    };

    // 无 sig / 已变化：立刻返回完整列表
    if (!$sigMatches($sig, $clientSig)) {
        $changed = true;
    } else {
        while (microtime(true) < $deadline) {
            if (connection_aborted()) {
                exit;
            }
            usleep(400000); // 0.4s — 跨设备延迟通常 < 1 秒
            if (connection_aborted()) {
                exit;
            }
            $sig = contraInboxPendingSignature($pdo, $companyId);
            if (!$sigMatches($sig, $clientSig)) {
                $changed = true;
                break;
            }
        }
    }

    $items = contraInboxFetchPending($pdo, $companyId);
    $sig = contraInboxSignatureFromItems($items);
    $waitedMs = (int) round((microtime(true) - $started) * 1000);

    echo json_encode([
        'success' => true,
        'message' => '',
        'data' => [
            'items' => $items,
            'sig' => $sig,
            'changed' => $changed,
            'waited_ms' => $waitedMs,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}
