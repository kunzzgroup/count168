<?php

require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../../config.php';

function api_apply_cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowList = [];
    $envAllow = getenv('FRONTEND_ORIGIN_ALLOWLIST');
    if (is_string($envAllow) && trim($envAllow) !== '') {
        $allowList = array_filter(array_map('trim', explode(',', $envAllow)));
    }

    if ($origin !== '' && in_array($origin, $allowList, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function api_start_session(): void {
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => $isHttps ? 'None' : 'Lax',
    ]);
    session_start();
}

function api_login_user(array $user): void {
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['login_id'] = $user['login_id'];
    $_SESSION['name'] = $user['name'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['user_type'] = 'user';
    $_SESSION['company_id'] = $user['company_numeric_id'];
    $_SESSION['company_code'] = $user['company_code'];
    $_SESSION['last_activity'] = time();
    $_SESSION['read_only'] = isset($user['read_only']) ? (int) $user['read_only'] : 1;
    $_SESSION['secondary_password_verified'] = true;
}

function api_login_owner(array $owner): void {
    $_SESSION['user_id'] = $owner['id'];
    $_SESSION['login_id'] = $owner['owner_code'];
    $_SESSION['name'] = $owner['name'];
    $_SESSION['role'] = 'owner';
    $_SESSION['user_type'] = 'owner';
    $_SESSION['owner_id'] = $owner['id'];
    $_SESSION['real_owner_id'] = $owner['id'];
    $_SESSION['owner_code'] = $owner['owner_code'];
    $_SESSION['company_id'] = $owner['company_numeric_id'];
    $_SESSION['company_code'] = $owner['company_code'];
    $_SESSION['last_activity'] = time();
}

function api_login_member(array $account): void {
    $_SESSION['member_login_account_id'] = $account['id'];
    $_SESSION['user_id'] = $account['id'];
    $_SESSION['login_id'] = $account['account_id'];
    $_SESSION['name'] = $account['name'];
    $_SESSION['role'] = $account['role'];
    $_SESSION['user_type'] = 'member';
    $_SESSION['account_id'] = $account['account_id'];
    $_SESSION['company_id'] = $account['company_numeric_id'];
    $_SESSION['last_activity'] = time();
}

function api_is_company_expired_or_unset($expirationDate, $companyCode = null): bool {
    if (strtoupper(trim((string) $companyCode)) === 'C168') {
        return false;
    }
    if ($expirationDate === null || trim((string) $expirationDate) === '') {
        return true;
    }
    $expTs = strtotime((string) $expirationDate);
    if ($expTs === false) {
        return true;
    }
    return $expTs < strtotime(date('Y-m-d'));
}

