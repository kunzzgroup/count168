<?php
/**
 * Entry router for SPA + session bootstrap.
 * Canonical login URL: /login
 */
session_start();
require_once __DIR__ . '/config.php';

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

function serveSpaIndex(): void
{
    $spaIndexPath = __DIR__ . '/frontend/dist/index.html';
    if (!file_exists($spaIndexPath)) {
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        echo "SPA build missing. Run: cd frontend && npm run build";
        exit();
    }

    header('Content-Type: text/html; charset=utf-8');
    readfile($spaIndexPath);
    exit();
}

if (isset($_SESSION['user_id'])) {
    if (isset($_SESSION['user_type']) && strtolower((string) $_SESSION['user_type']) === 'member') {
        header('Location: member.php');
    } else {
        if ($requestPath === '/login' || $requestPath === '/dashboard' || $requestPath === '/domain' || $requestPath === '/announcement' || $requestPath === '/account-list' || $requestPath === '/add-account') {
            serveSpaIndex();
        }
        header('Location: /dashboard');
    }
    exit();
}

if (isset($_COOKIE['remember_token'])) {
    $remember_token = $_COOKIE['remember_token'];

    $stmt = $pdo->prepare(
        "SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND status = 'active'"
    );
    $stmt->execute([$remember_token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];

        $company_id = null;
        try {
            $stmt2 = $pdo->prepare(
                "
                SELECT c.id
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != ''
                ORDER BY c.company_id ASC
                LIMIT 1
            "
            );
            $stmt2->execute([$user['id']]);
            $company_id = $stmt2->fetchColumn();
        } catch (PDOException $e) {
            error_log('获取用户 company 失败: ' . $e->getMessage());
        }

        if (!$company_id && isset($user['company_id'])) {
            $company_id = $user['company_id'];
        }

        $_SESSION['company_id'] = $company_id ? (int) $company_id : null;
        $_SESSION['last_activity'] = time();

        $stmt = $pdo->prepare('UPDATE user SET last_login = NOW() WHERE id = ?');
        $stmt->execute([$user['id']]);

        if (isset($_SESSION['user_type']) && strtolower((string) $_SESSION['user_type']) === 'member') {
            header('Location: member.php');
        } else {
            if ($requestPath === '/login' || $requestPath === '/dashboard' || $requestPath === '/domain' || $requestPath === '/announcement' || $requestPath === '/account-list' || $requestPath === '/add-account') {
                serveSpaIndex();
            }
            header('Location: /dashboard');
        }
        exit();
    }

    setcookie('remember_token', '', time() - 3600, '/', '', false, true);
}

if ($requestPath === '/dashboard' || $requestPath === '/domain' || $requestPath === '/announcement' || $requestPath === '/account-list' || $requestPath === '/add-account') {
    header('Location: /login');
    exit();
}

if ($requestPath === '/' || $requestPath === '/index.php') {
    header('Location: /login');
    exit();
}

if ($requestPath === '/login') {
    serveSpaIndex();
}

header('Location: /login');
exit();
