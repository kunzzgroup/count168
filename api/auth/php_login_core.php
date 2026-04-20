<?php
/**
 * Spring 不可用时，与 LoginService 对齐的 PHP 登录（同库校验 + session 字段）。
 */

function eazycount_expired_company($expirationRaw, $companyCode) {
    if ($companyCode !== null && strcasecmp(trim((string) $companyCode), 'C168') === 0) {
        return false;
    }
    if ($expirationRaw === null || $expirationRaw === '') {
        return true;
    }
    $ts = is_numeric($expirationRaw) ? (int) $expirationRaw : strtotime((string) $expirationRaw);
    if ($ts === false) {
        return true;
    }
    return $ts < strtotime('today');
}

function eazycount_password_ok_user(string $plain, string $stored): bool {
    if ($stored === '') {
        return false;
    }
    $t = $stored[0] === '$' && (strpos($stored, '$2y$') === 0 || strpos($stored, '$2a$') === 0 || strpos($stored, '$2b$') === 0);
    if ($t) {
        return password_verify($plain, $stored);
    }
    return hash_equals($stored, $plain);
}

function eazycount_password_ok_owner(string $plain, string $stored): array {
    if ($stored === '') {
        return ['match' => false, 'plain_only' => false];
    }
    if ($stored[0] === '$' && (strpos($stored, '$2y$') === 0 || strpos($stored, '$2a$') === 0 || strpos($stored, '$2b$') === 0)) {
        return ['match' => password_verify($plain, $stored), 'plain_only' => false];
    }
    if (hash_equals($stored, $plain)) {
        return ['match' => true, 'plain_only' => true];
    }
    return ['match' => false, 'plain_only' => false];
}

function eazycount_random_remember_token(): string {
    return bin2hex(random_bytes(32));
}

/**
 * @return array{ok:bool,message?:string,session?:array,next_redirect?:string,remember_cookie?:?string}
 */
function eazycount_php_login_attempt(PDO $pdo, array $post): array {
    $password = trim((string) ($post['password'] ?? ''));
    $companyId = strtoupper(trim((string) ($post['company_id'] ?? '')));
    $loginRole = strtolower(trim((string) ($post['login_role'] ?? '')));
    if ($loginRole === '') {
        $loginRole = 'admin';
    }
    $rememberMe = isset($post['remember_me']) && ((string) $post['remember_me'] === '1' || strtolower((string) $post['remember_me']) === 'true');

    if ($companyId === '') {
        return ['ok' => false, 'message' => 'Invalid request'];
    }
    if ($password === '') {
        return ['ok' => false, 'message' => 'Please enter password'];
    }

    try {
        if ($loginRole === 'member') {
            return eazycount_php_login_member($pdo, $password, $companyId, (string) ($post['account_id'] ?? ''));
        }
        return eazycount_php_login_admin_or_owner($pdo, $password, $companyId, (string) ($post['login_id'] ?? ''), $rememberMe);
    } catch (Throwable $e) {
        error_log('eazycount_php_login_attempt: ' . $e->getMessage());
        return ['ok' => false, 'message' => 'Database error, please try again later'];
    }
}

function eazycount_php_login_member(PDO $pdo, string $password, string $companyId, string $accountIdRaw): array {
    $accountId = trim($accountIdRaw);
    if ($accountId === '') {
        return ['ok' => false, 'message' => 'Please enter account ID'];
    }
    $sql = 'SELECT a.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        INNER JOIN company c ON ac.company_id = c.id
        WHERE UPPER(a.account_id) = UPPER(?)
        AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)
        AND a.status = \'active\'';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$accountId, $companyId, $companyId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $account = null;
    $passwordMatch = false;
    $hasExpired = false;

    foreach ($rows as $row) {
        $rowPwd = isset($row['password']) ? (string) $row['password'] : '';
        if ($rowPwd !== '' && hash_equals($rowPwd, $password)) {
            $passwordMatch = true;
            $code = isset($row['company_code']) ? (string) $row['company_code'] : null;
            $exp = $row['expiration_date'] ?? null;
            if (eazycount_expired_company($exp, $code)) {
                $hasExpired = true;
            } else {
                $account = $row;
                break;
            }
        }
    }

    if ($account !== null) {
        $aid = (int) $account['id'];
        $pdo->prepare('UPDATE account SET last_login = NOW() WHERE id = ?')->execute([$aid]);

        $session = [
            'member_login_account_id' => $aid,
            'user_id' => $aid,
            'login_id' => (string) $account['account_id'],
            'name' => isset($account['name']) ? (string) $account['name'] : '',
            'role' => isset($account['role']) ? (string) $account['role'] : '',
            'user_type' => 'member',
            'account_id' => (string) $account['account_id'],
            'company_id' => (int) $account['company_numeric_id'],
            'last_activity' => time(),
        ];
        return ['ok' => true, 'session' => $session, 'next_redirect' => '/?r=/member'];
    }
    if ($passwordMatch && $hasExpired) {
        return ['ok' => false, 'message' => 'Company or Group has expired.'];
    }
    return ['ok' => false, 'message' => 'Account ID, Company ID or password is incorrect'];
}

function eazycount_php_login_admin_or_owner(PDO $pdo, string $password, string $companyId, string $loginIdRaw, bool $rememberMe): array {
    $loginId = trim($loginIdRaw);
    if ($loginId === '') {
        return ['ok' => false, 'message' => 'Please enter username'];
    }

    $userSql = 'SELECT u.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        INNER JOIN company c ON ucm.company_id = c.id
        WHERE u.login_id = ? AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?) AND u.status = \'active\'';
    $stmt = $pdo->prepare($userSql);
    $stmt->execute([$loginId, $companyId, $companyId]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $user = null;
    $userPasswordMatch = false;
    $userHasExpired = false;

    foreach ($users as $row) {
        $hashed = isset($row['password']) ? (string) $row['password'] : '';
        if ($hashed !== '' && eazycount_password_ok_user($password, $hashed)) {
            $userPasswordMatch = true;
            $code = isset($row['company_code']) ? (string) $row['company_code'] : null;
            $exp = $row['expiration_date'] ?? null;
            if (eazycount_expired_company($exp, $code)) {
                $userHasExpired = true;
            } else {
                $user = $row;
                break;
            }
        }
    }

    if ($user !== null) {
        return eazycount_php_finalize_user($pdo, $user, $rememberMe);
    }
    if ($userPasswordMatch && $userHasExpired) {
        return ['ok' => false, 'message' => 'Company or Group has expired.'];
    }

    return eazycount_php_login_owner($pdo, $password, $companyId, $loginId);
}

function eazycount_php_finalize_user(PDO $pdo, array $user, bool $rememberMe): array {
    $userId = (int) $user['id'];
    $companyNumericId = (int) $user['company_numeric_id'];
    $companyCode = isset($user['company_code']) ? (string) $user['company_code'] : '';

    $pdo->prepare('UPDATE user SET last_login = NOW() WHERE id = ?')->execute([$userId]);

    $rememberCookie = null;
    $session = [];

    if ($rememberMe) {
        $rememberToken = eazycount_random_remember_token();
        $rememberCookie = $rememberToken;
        $pdo->prepare('UPDATE user SET remember_token = ?, remember_token_expires = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?')
            ->execute([$rememberToken, $userId]);
        $session['_bootstrap_remember_token'] = $rememberToken;
    }

    $session['user_id'] = $userId;
    $session['login_id'] = (string) $user['login_id'];
    $session['name'] = isset($user['name']) ? (string) $user['name'] : '';
    $session['role'] = isset($user['role']) ? (string) $user['role'] : '';
    $session['user_type'] = 'user';
    $session['company_id'] = $companyNumericId;
    $session['company_code'] = $companyCode;
    $session['last_activity'] = time();
    $ro = $user['read_only'] ?? null;
    $session['read_only'] = $ro !== null ? (int) $ro : 1;

    $needsSecondary = false;
    if (strcasecmp($companyCode, 'C168') === 0) {
        $stmt = $pdo->prepare('SELECT secondary_password FROM user WHERE id = ?');
        $stmt->execute([$userId]);
        $sec = $stmt->fetchColumn();
        $needsSecondary = $sec !== false && $sec !== null && (string) $sec !== '';
    }

    if ($needsSecondary) {
        $next = '/?r=/owner-secondary-password';
    } else {
        $session['secondary_password_verified'] = true;
        $next = '/?r=/dashboard';
    }

    return ['ok' => true, 'session' => $session, 'next_redirect' => $next, 'remember_cookie' => $rememberCookie];
}

function eazycount_php_login_owner(PDO $pdo, string $password, string $companyId, string $loginId): array {
    $ownerSql = 'SELECT o.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
        FROM owner o
        INNER JOIN company c ON c.owner_id = o.id
        WHERE UPPER(o.owner_code) = UPPER(?) AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)';
    $stmt = $pdo->prepare($ownerSql);
    $stmt->execute([$loginId, $companyId, $companyId]);
    $owners = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $owner = null;
    $ownerPlainUpgrade = null;
    $ownerPasswordMatch = false;
    $ownerHasExpired = false;

    foreach ($owners as $row) {
        $hashed = isset($row['password']) ? (string) $row['password'] : '';
        $chk = eazycount_password_ok_owner($password, $hashed);
        if (!$chk['match']) {
            continue;
        }
        $ownerPasswordMatch = true;
        $code = isset($row['company_code']) ? (string) $row['company_code'] : null;
        $exp = $row['expiration_date'] ?? null;
        if (eazycount_expired_company($exp, $code)) {
            $ownerHasExpired = true;
            continue;
        }
        $owner = $row;
        if (!empty($chk['plain_only'])) {
            $ownerPlainUpgrade = $row;
        }
        break;
    }

    if ($owner !== null) {
        $oid = (int) $owner['id'];
        if ($ownerPlainUpgrade !== null && $oid === (int) $ownerPlainUpgrade['id']) {
            $newHash = password_hash($password, PASSWORD_BCRYPT);
            $pdo->prepare('UPDATE owner SET password = ? WHERE id = ?')->execute([$newHash, $oid]);
        }

        $companyNum = (int) $owner['company_numeric_id'];
        $ownerCode = isset($owner['owner_code']) ? (string) $owner['owner_code'] : '';
        $coCode = isset($owner['company_code']) ? (string) $owner['company_code'] : '';
        $name = isset($owner['name']) ? (string) $owner['name'] : '';

        $session = [
            'user_id' => $oid,
            'login_id' => $ownerCode,
            'name' => $name,
            'role' => 'owner',
            'user_type' => 'owner',
            'owner_id' => $oid,
            'real_owner_id' => $oid,
            'owner_code' => $ownerCode,
            'company_id' => $companyNum,
            'company_code' => $coCode,
            'last_activity' => time(),
        ];
        return ['ok' => true, 'session' => $session, 'next_redirect' => '/?r=/dashboard', 'remember_cookie' => null];
    }
    if ($ownerPasswordMatch && $ownerHasExpired) {
        return ['ok' => false, 'message' => 'Company or Group has expired.'];
    }
    return ['ok' => false, 'message' => 'Username or password is incorrect'];
}
