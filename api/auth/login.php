<?php

require_once __DIR__ . '/_auth_common.php';

api_apply_cors();
api_start_session();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    api_error('Invalid request method', 405, null, 'ERR_METHOD_NOT_ALLOWED');
    exit;
}

$raw = file_get_contents('php://input');
$jsonInput = json_decode($raw ?: '', true);
$payload = is_array($jsonInput) ? $jsonInput : $_POST;

$companyId = strtoupper(trim((string) ($payload['company_id'] ?? '')));
$password = trim((string) ($payload['password'] ?? ''));
$loginRole = trim((string) ($payload['login_role'] ?? 'admin'));

if ($companyId === '' || $password === '') {
    api_validation_error('company_id and password are required');
    exit;
}

try {
    if ($loginRole === 'member') {
        $accountId = trim((string) ($payload['account_id'] ?? ''));
        if ($accountId === '') {
            api_validation_error('account_id is required for member');
            exit;
        }

        $stmt = $pdo->prepare("
            SELECT a.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            INNER JOIN company c ON ac.company_id = c.id
            WHERE UPPER(a.account_id) = UPPER(?)
              AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)
              AND a.status = 'active'
        ");
        $stmt->execute([$accountId, $companyId, $companyId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as $row) {
            if (!empty($row['password']) && $password === $row['password'] && !api_is_company_expired_or_unset($row['expiration_date'] ?? null, $row['company_code'] ?? null)) {
                api_login_member($row);
                $pdo->prepare("UPDATE account SET last_login = NOW() WHERE id = ?")->execute([$row['id']]);
                api_success(['redirect' => '/dashboard'], 'Login success', 'OK_LOGIN_SUCCESS');
                exit;
            }
        }

        api_error('Account ID, Company ID or password is incorrect', 401, null, 'ERR_LOGIN_FAILED');
        exit;
    }

    $loginId = trim((string) ($payload['login_id'] ?? ''));
    if ($loginId === '') {
        api_validation_error('login_id is required');
        exit;
    }

    $stmt = $pdo->prepare("
        SELECT u.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        INNER JOIN company c ON ucm.company_id = c.id
        WHERE u.login_id = ? AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?) AND u.status = 'active'
    ");
    $stmt->execute([$loginId, $companyId, $companyId]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($users as $user) {
        if (password_verify($password, $user['password']) && !api_is_company_expired_or_unset($user['expiration_date'] ?? null, $user['company_code'] ?? null)) {
            api_login_user($user);
            $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);
            api_success(['redirect' => '/dashboard'], 'Login success', 'OK_LOGIN_SUCCESS');
            exit;
        }
    }

    $stmt = $pdo->prepare("
        SELECT o.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM owner o
        INNER JOIN company c ON c.owner_id = o.id
        WHERE UPPER(o.owner_code) = UPPER(?) AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)
    ");
    $stmt->execute([$loginId, $companyId, $companyId]);
    $owners = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($owners as $owner) {
        $pwdOk = password_verify($password, $owner['password']) || $password === $owner['password'];
        if ($pwdOk && !api_is_company_expired_or_unset($owner['expiration_date'] ?? null, $owner['company_code'] ?? null)) {
            if ($password === $owner['password']) {
                $hashed = password_hash($password, PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE owner SET password = ? WHERE id = ?")->execute([$hashed, $owner['id']]);
            }
            api_login_owner($owner);
            api_success(['redirect' => '/dashboard'], 'Login success', 'OK_LOGIN_SUCCESS');
            exit;
        }
    }

    api_error('Username or password is incorrect', 401, null, 'ERR_LOGIN_FAILED');
} catch (Throwable $e) {
    error_log('auth/login failed: ' . $e->getMessage());
    api_error('Database error, please try again later', 500, null, 'ERR_INTERNAL');
}

