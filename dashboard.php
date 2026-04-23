<?php
session_start();
require_once 'config.php';

define('SESSION_TIMEOUT', 3600);

if (!isset($_SESSION['user_id']) && isset($_COOKIE['remember_token'])) {
    $remember_token = $_COOKIE['remember_token'];

    $stmt = $pdo->prepare("SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND company_id = 'c168' AND status = 'active'");
    $stmt->execute([$remember_token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['user_type'] = $_SESSION['user_type'] ?? 'user';
        $_SESSION['company_id'] = $_SESSION['company_id'] ?? null;
        $_SESSION['last_activity'] = time();

        $stmt = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user['id']]);
    }
}

if (!isset($_SESSION['user_id'])) {
    header("Location: /login");
    exit();
}

if (isset($_GET['logout'])) {
    if (isset($_SESSION['user_id'])) {
        try {
            $stmt = $pdo->prepare("UPDATE user SET remember_token = NULL, remember_token_expires = NULL WHERE id = ?");
            $stmt->execute([$_SESSION['user_id']]);
        } catch (PDOException $e) {
            // no-op
        }
    }
    session_unset();
    session_destroy();
    if (isset($_COOKIE['remember_token'])) {
        setcookie('remember_token', '', time() - 3600, "/", "", false, true);
    }
    header("Location: /login");
    exit();
}

if (
    isset($_SESSION['last_activity']) &&
    (time() - $_SESSION['last_activity'] > SESSION_TIMEOUT) &&
    !isset($_COOKIE['remember_token'])
) {
    session_unset();
    session_destroy();
    header("Location: /login");
    exit();
}

if (isset($_SESSION['user_type']) && strtolower($_SESSION['user_type']) === 'member') {
    header("Location: /member");
    exit();
}

if (isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner') {
    if (!isset($_SESSION['secondary_password_verified']) || $_SESSION['secondary_password_verified'] !== true) {
        header("Location: /owner-secondary-password");
        exit();
    }
}

$_SESSION['last_activity'] = time();

header("Location: /dashboard");
exit();