<?php
/**
 * Legacy entry — Win/Loss UI is served by the React SPA at /member.
 */
require_once __DIR__ . '/session_check.php';

if (strtolower($_SESSION['user_type'] ?? '') !== 'member') {
    header('Location: /login', true, 302);
    exit;
}

header('Location: /member', true, 302);
exit;
