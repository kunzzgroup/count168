<?php

require_once __DIR__ . '/_auth_common.php';

api_apply_cors();
api_start_session();

if (!isset($_SESSION['user_id'])) {
    api_session_expired();
    exit;
}

$_SESSION['last_activity'] = time();
api_success(['last_activity' => $_SESSION['last_activity']], 'Session refreshed', 'OK_SESSION_REFRESHED');

