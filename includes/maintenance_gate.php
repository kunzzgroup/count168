<?php
/**
 * Global maintenance mode gate.
 *
 * Rules:
 * - When maintenance mode is enabled, only allowlisted IT login_ids may continue.
 * - IT bypass requires user.status = 'active'.
 */

if (!function_exists('maintenance_gate_it_allowlist')) {
    /**
     * Hardcoded IT login_id allowlist.
     *
     * @return string[]
     */
    function maintenance_gate_it_allowlist(): array
    {
        return ['it_jk', 'it_js', 'it_ms'];
    }
}

if (!function_exists('maintenance_gate_norm_login_id')) {
    function maintenance_gate_norm_login_id(?string $loginId): string
    {
        return strtolower(trim((string) $loginId));
    }
}

if (!function_exists('maintenance_gate_is_allowlisted_login')) {
    function maintenance_gate_is_allowlisted_login(?string $loginId): bool
    {
        $norm = maintenance_gate_norm_login_id($loginId);
        if ($norm === '') {
            return false;
        }
        return in_array($norm, maintenance_gate_it_allowlist(), true);
    }
}

if (!function_exists('maintenance_gate_is_allowlisted_login_db')) {
    function maintenance_gate_is_allowlisted_login_db(PDO $pdo, ?string $loginId): bool
    {
        $norm = strtoupper(trim((string) $loginId));
        if ($norm === '') {
            return false;
        }
        try {
            $stmt = $pdo->prepare(
                "SELECT 1
                 FROM system_it_allowlist
                 WHERE UPPER(TRIM(login_id)) = ?
                   AND enabled = 1
                 LIMIT 1"
            );
            $stmt->execute([$norm]);
            return (bool) $stmt->fetchColumn();
        } catch (Throwable $e) {
            // Table may not exist before migration.
            return false;
        }
    }
}

if (!function_exists('maintenance_gate_is_enabled')) {
    function maintenance_gate_is_enabled(PDO $pdo): bool
    {
        try {
            $stmt = $pdo->query(
                "SELECT maintenance_mode_enabled
                 FROM system_runtime_flags
                 WHERE id = 1
                 LIMIT 1"
            );
            $value = $stmt ? $stmt->fetchColumn() : null;
            return (int) $value === 1;
        } catch (Throwable $e) {
            // Table may not exist before migration; default to disabled.
            return false;
        }
    }
}

if (!function_exists('maintenance_gate_fetch_message')) {
    function maintenance_gate_fetch_message(PDO $pdo): string
    {
        $fallback = 'System is under maintenance. Please try again later.';

        try {
            $stmt = $pdo->query(
                "SELECT maintenance_message_id
                 FROM system_runtime_flags
                 WHERE id = 1
                 LIMIT 1"
            );
            $messageId = (int) ($stmt ? $stmt->fetchColumn() : 0);

            if ($messageId > 0) {
                $msgStmt = $pdo->prepare(
                    "SELECT prefix, content
                     FROM maintenance_marquee
                     WHERE id = ?
                     LIMIT 1"
                );
                $msgStmt->execute([$messageId]);
                $row = $msgStmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $prefix = trim((string) ($row['prefix'] ?? ''));
                    $content = trim((string) ($row['content'] ?? ''));
                    $plain = trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    $message = trim($prefix . ' ' . $plain);
                    if ($message !== '') {
                        return $message;
                    }
                }
            }

            $latestStmt = $pdo->query(
                "SELECT prefix, content
                 FROM maintenance_marquee
                 WHERE company_code = 'C168' AND status = 'active'
                 ORDER BY created_at DESC
                 LIMIT 1"
            );
            $latest = $latestStmt ? $latestStmt->fetch(PDO::FETCH_ASSOC) : null;
            if ($latest) {
                $prefix = trim((string) ($latest['prefix'] ?? ''));
                $content = trim((string) ($latest['content'] ?? ''));
                $plain = trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                $message = trim($prefix . ' ' . $plain);
                if ($message !== '') {
                    return $message;
                }
            }
        } catch (Throwable $e) {
            error_log('maintenance_gate_fetch_message failed: ' . $e->getMessage());
        }

        return $fallback;
    }
}

if (!function_exists('maintenance_gate_is_active_user_login')) {
    function maintenance_gate_is_active_user_login(PDO $pdo, ?string $loginId): bool
    {
        $isHardcoded = maintenance_gate_is_allowlisted_login($loginId);
        $isDbAllowlisted = maintenance_gate_is_allowlisted_login_db($pdo, $loginId);
        if (!$isHardcoded && !$isDbAllowlisted) {
            return false;
        }

        $norm = strtoupper(trim((string) $loginId));
        if ($norm === '') {
            return false;
        }

        try {
            $stmt = $pdo->prepare(
                "SELECT 1
                 FROM user
                 WHERE UPPER(TRIM(login_id)) = ?
                   AND status = 'active'
                 LIMIT 1"
            );
            $stmt->execute([$norm]);
            return (bool) $stmt->fetchColumn();
        } catch (Throwable $e) {
            error_log('maintenance_gate_is_active_user_login failed: ' . $e->getMessage());
            return false;
        }
    }
}

if (!function_exists('maintenance_gate_clear_session_state')) {
    function maintenance_gate_clear_session_state(): void
    {
        if (function_exists('session_user_payload_cache_clear')) {
            session_user_payload_cache_clear();
        }

        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', [
                    'expires' => time() - 42000,
                    'path' => $params['path'] ?: '/',
                    'domain' => $params['domain'] ?: '',
                    'secure' => (bool) ($params['secure'] ?? false),
                    'httponly' => (bool) ($params['httponly'] ?? true),
                    'samesite' => $params['samesite'] ?? 'Lax',
                ]);
            }
            session_destroy();
        }

        if (function_exists('clear_remember_token_cookie')) {
            clear_remember_token_cookie();
        } else {
            setcookie('remember_token', '', time() - 42000, '/');
        }
    }
}

if (!function_exists('maintenance_gate_emit_blocked_response')) {
    /**
     * @return never
     */
    function maintenance_gate_emit_blocked_response(PDO $pdo, bool $isApiRequest): void
    {
        $message = maintenance_gate_fetch_message($pdo);
        maintenance_gate_clear_session_state();

        if ($isApiRequest) {
            if (!headers_sent()) {
                header('Content-Type: application/json; charset=utf-8');
            }
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'status' => 'error',
                'message' => $message,
                'redirect' => '/login',
                'maintenance_mode' => true,
                'data' => null,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $redirect = '/login?maintenance=1';
        if (!headers_sent()) {
            header('Location: ' . $redirect);
        }
        exit;
    }
}

if (!function_exists('maintenance_gate_enforce_active_session')) {
    function maintenance_gate_enforce_active_session(PDO $pdo, bool $isApiRequest): void
    {
        if (!isset($_SESSION['user_id'])) {
            return;
        }
        if (!maintenance_gate_is_enabled($pdo)) {
            return;
        }

        $loginId = (string) ($_SESSION['login_id'] ?? '');
        if (maintenance_gate_is_active_user_login($pdo, $loginId)) {
            return;
        }

        maintenance_gate_emit_blocked_response($pdo, $isApiRequest);
    }
}

if (!function_exists('maintenance_gate_build_login_reject_payload')) {
    function maintenance_gate_build_login_reject_payload(PDO $pdo): array
    {
        return [
            'status' => 'error',
            'message' => maintenance_gate_fetch_message($pdo),
            'maintenance_mode' => true,
        ];
    }
}
