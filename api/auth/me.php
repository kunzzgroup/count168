<?php

require_once __DIR__ . '/_auth_common.php';

api_apply_cors();
api_start_session();

if (!isset($_SESSION['user_id'])) {
    api_unauthorized('Please login first.');
    exit;
}

$user = [
    'user_id' => $_SESSION['user_id'] ?? null,
    'login_id' => $_SESSION['login_id'] ?? null,
    'name' => $_SESSION['name'] ?? null,
    'role' => $_SESSION['role'] ?? null,
    'user_type' => $_SESSION['user_type'] ?? null,
    'company_id' => $_SESSION['company_id'] ?? null,
    'company_code' => $_SESSION['company_code'] ?? null,
    'secondary_verified' => ($_SESSION['secondary_password_verified'] ?? false) === true,
    'read_only' => $_SESSION['read_only'] ?? null,
];

api_success($user, 'OK', 'OK_AUTH_ME');

