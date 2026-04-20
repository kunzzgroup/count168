<?php

require_once __DIR__ . '/_auth_common.php';

api_apply_cors();
api_start_session();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    api_error('Invalid request method', 405, null, 'ERR_METHOD_NOT_ALLOWED');
    exit;
}

try {
    if (!empty($_SESSION['user_type']) && $_SESSION['user_type'] === 'user' && isset($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("UPDATE user SET remember_token = NULL, remember_token_expires = NULL WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
    }
} catch (Throwable $e) {
    error_log('auth/logout token clear failed: ' . $e->getMessage());
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
}
setcookie('remember_token', '', time() - 3600, '/', '', false, true);
session_destroy();

api_success(['redirect' => '/login'], 'Logout success', 'OK_LOGOUT_SUCCESS');

