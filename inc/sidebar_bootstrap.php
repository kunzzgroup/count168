<?php
/**
 * 侧边栏所需上下文（供 sidebar.php 与 React window.__SIDEBAR_BOOTSTRAP 共用）。
 * 前置：已 session_start、已登录、已 $pdo。
 *
 * @return array<string,mixed>
 */
function eazycount_sidebar_bootstrap(PDO $pdo): array
{
    $isMember = isset($_SESSION['user_type']) && strtolower((string) $_SESSION['user_type']) === 'member';

    $user_id = $_SESSION['user_id'];
    $login_id = $_SESSION['login_id'] ?? '';
    $name = $_SESSION['name'] ?? '';
    $role = $_SESSION['role'] ?? '';

    $permissions = [];
    if (!$isMember) {
        $stmt = $pdo->prepare('SELECT permissions FROM user WHERE id = ?');
        $stmt->execute([$user_id]);
        $userPermissions = $stmt->fetchColumn();
        $permissions = $userPermissions ? json_decode((string) $userPermissions, true) : [];
        if (!is_array($permissions)) {
            $permissions = [];
        }
    }

    $hasC168Access = false;
    $companyId = $_SESSION['company_id'] ?? null;
    if ($user_id) {
        $roleLower = strtolower((string) $role);
        $companyCodeSess = strtoupper((string) ($_SESSION['company_code'] ?? ''));

        if (in_array($roleLower, ['owner', 'admin'], true)) {
            if ($companyCodeSess === 'C168') {
                $hasC168Access = true;
            } elseif ($companyId) {
                try {
                    $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
                    $stmt->execute([$companyId]);
                    $hasC168Access = $stmt->fetchColumn() > 0;
                } catch (PDOException $e) {
                    error_log('检查 c168 权限失败: ' . $e->getMessage());
                    $hasC168Access = false;
                }
            }
        }
    }

    $isCurrentCompanyC168 = false;
    $currentCompanyCode = strtoupper(trim((string) ($_SESSION['company_code'] ?? '')));
    if ($currentCompanyCode === 'C168') {
        $isCurrentCompanyC168 = true;
    } elseif ($companyId) {
        try {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
            $stmt->execute([$companyId]);
            $isCurrentCompanyC168 = $stmt->fetchColumn() > 0;
        } catch (PDOException $e) {
            error_log('检查当前公司是否 c168 失败: ' . $e->getMessage());
            $isCurrentCompanyC168 = false;
        }
    }

    $hasC168Access = $isCurrentCompanyC168 && in_array(strtolower((string) $role), ['owner', 'admin'], true);

    $avatarLetter = $login_id !== '' ? strtoupper($login_id[0]) : 'U';

    $avatarImages = [
        'male1' => 'images/avatar1.png',
        'male2' => 'images/avatar2.png',
        'male3' => 'images/avatar3.png',
        'male4' => 'images/avatar4.png',
        'male5' => 'images/avatar5.png',
        'male6' => 'images/avatar6.png',
        'male7' => 'images/avatar7.png',
        'male8' => 'images/avatar8.png',
        'male9' => 'images/avatar9.png',
        'female1' => 'images/female1.png',
        'female2' => 'images/female2.png',
        'female3' => 'images/female3.png',
        'female4' => 'images/female4.png',
        'female5' => 'images/female5.png',
        'female6' => 'images/female6.png',
        'female7' => 'images/female7.png',
        'female8' => 'images/female8.png',
        'female9' => 'images/female9.png',
    ];
    $avatarId = isset($_COOKIE['selectedAvatar'], $avatarImages[$_COOKIE['selectedAvatar']])
        ? (string) $_COOKIE['selectedAvatar']
        : 'male1';
    $initialAvatarSrc = $avatarImages[$avatarId];

    $company_expiration_date = null;
    $expiration_countdown_text = '';
    $expiration_status = 'normal';
    if ($companyId) {
        try {
            $stmt = $pdo->prepare('SELECT expiration_date FROM company WHERE id = ?');
            $stmt->execute([$companyId]);
            $company_expiration_date = $stmt->fetchColumn();

            if ($company_expiration_date) {
                $now = new DateTime();
                $now->setTime(0, 0, 0);
                $expiration = new DateTime((string) $company_expiration_date);
                $expiration->setTime(0, 0, 0);

                $diff = $now->diff($expiration);
                $diffDays = (int) $diff->format('%r%a');

                if ($diffDays < 0) {
                    $expiration_countdown_text = 'Expired';
                    $expiration_status = 'expired';
                } elseif ($diffDays === 0) {
                    $expiration_countdown_text = 'Expires today';
                    $expiration_status = 'warning';
                } elseif ($diffDays <= 7) {
                    $expiration_countdown_text = $diffDays . ' day' . ($diffDays > 1 ? 's' : '') . ' left';
                    $expiration_status = 'warning';
                } elseif ($diffDays <= 30) {
                    $expiration_countdown_text = $diffDays . ' days left';
                    $expiration_status = 'normal';
                } else {
                    $months = (int) floor($diffDays / 30);
                    $days = $diffDays % 30;
                    if ($days === 0) {
                        $expiration_countdown_text = $months . ' month' . ($months > 1 ? 's' : '') . ' left';
                    } else {
                        $expiration_countdown_text = $months . 'm ' . $days . 'd left';
                    }
                    $expiration_status = 'normal';
                }
            } else {
                $expiration_countdown_text = 'No expiration date';
                $expiration_status = 'normal';
            }
        } catch (PDOException $e) {
            error_log('获取公司到期日期失败: ' . $e->getMessage());
            $company_expiration_date = null;
            $expiration_countdown_text = 'No expiration date';
            $expiration_status = 'normal';
        }
    }

    $companyHasGambling = false;
    $companyCategories = [];
    if ($companyId) {
        try {
            $stmt = $pdo->prepare('SELECT permissions FROM company WHERE id = ?');
            $stmt->execute([$companyId]);
            $permsJson = $stmt->fetchColumn();
            if ($permsJson) {
                $companyPerms = json_decode((string) $permsJson, true);
                $companyCategories = is_array($companyPerms) ? $companyPerms : [];
                $companyHasGambling = in_array('Games', $companyCategories, true) || in_array('Gambling', $companyCategories, true);
            }
        } catch (PDOException $e) {
            error_log('获取公司权限失败: ' . $e->getMessage());
        }
    }
    $companyHasBank = !empty($companyCategories) && in_array('Bank', $companyCategories, true);

    $hasMaintenance = empty($permissions) || in_array('maintenance', $permissions, true);

    $isExternalView = (isset($_SESSION['is_external_view']) && $_SESSION['is_external_view'])
        || (isset($_SESSION['role']) && strtolower((string) $_SESSION['role']) === 'partnership'
            && (!isset($_SESSION['read_only']) || (int) $_SESSION['read_only'] === 1));

    return [
        'isMember' => $isMember,
        'user_id' => $user_id,
        'login_id' => $login_id,
        'name' => $name,
        'role' => $role,
        'permissions' => $permissions,
        'hasC168Access' => $hasC168Access,
        'companyId' => $companyId !== null ? (int) $companyId : null,
        'isCurrentCompanyC168' => $isCurrentCompanyC168,
        'currentCompanyCode' => $currentCompanyCode,
        'avatarLetter' => $avatarLetter,
        'avatarImages' => $avatarImages,
        'avatarId' => $avatarId,
        'initialAvatarSrc' => $initialAvatarSrc,
        'company_expiration_date' => $company_expiration_date !== null && $company_expiration_date !== false
            ? (string) $company_expiration_date
            : null,
        'expiration_countdown_text' => $expiration_countdown_text,
        'expiration_status' => $expiration_status,
        'companyHasGambling' => $companyHasGambling,
        'companyCategories' => $companyCategories,
        'companyHasBank' => $companyHasBank,
        'hasMaintenance' => $hasMaintenance,
        'isExternalView' => $isExternalView,
    ];
}
