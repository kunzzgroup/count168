<?php
/**
 * Hostinger / Apache root entry → React SPA login.
 * Replaces legacy PHP login so count168.com/ and /index.php open React.
 */
$login = '/login/05659e0a-5121-427b-b5f2-7bbc43e14b23';
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Location: ' . $login, true, 302);
exit;
