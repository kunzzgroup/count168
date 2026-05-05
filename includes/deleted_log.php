<?php
/**
 * 统一删除日志：SELECT 原行 → JSON → deleted_logs（不影响后续 DELETE 流程）
 *
 * @param PDO         $conn       数据库连接（本项目统一使用 PDO；mysqli 请自行适配）
 * @param string      $user       兜底用户名（优先使用 $_SESSION['username'] / login_id）
 * @param string      $page       调用页面或 API 标识
 * @param string      $table      物理表名（必须通过白名单）
 * @param string      $recordId   写入日志主键展示字段；WHERE id=? 时使用
 * @param string      $actionType 默认 DELETE
 * @param array|null  $whereEquals 若提供，则 WHERE 按关联列等值查询（用于无主键 id 的表）
 *
 * @return bool 是否成功写入日志（未查到原行返回 false；失败不抛异常以免影响删除）
 */
function deleted_log_allowed_tables(): array
{
    static $tables = null;
    if ($tables !== null) {
        return $tables;
    }
    $tables = [
        'account',
        'account_company',
        'account_currency',
        'account_link',
        'currency',
        'transactions',
        'transaction_entry',
        'company_ownership',
        'group_ownership',
        'data_captures',
        'data_capture_details',
        'submitted_processes',
        'data_capture_templates',
        'bank_process',
        'process',
        'maintenance_marquee',
    ];
    sort($tables);
    return $tables;
}

function deleted_log_validate_table(string $table): bool
{
    return in_array($table, deleted_log_allowed_tables(), true);
}

function deleted_log_session_username(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return '';
    }
    if (!empty($_SESSION['username'])) {
        return (string) $_SESSION['username'];
    }
    if (!empty($_SESSION['login_id'])) {
        return (string) $_SESSION['login_id'];
    }
    if (!empty($_SESSION['name'])) {
        return (string) $_SESSION['name'];
    }
    return '';
}

function deleted_log_company_id_string(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return '';
    }
    return isset($_SESSION['company_id']) ? (string) $_SESSION['company_id'] : '';
}

function deleted_log_client_ip(): string
{
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($parts[0]);
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

function deletedLog(PDO $conn, string $user, string $page, string $table, string $recordId, string $actionType = 'DELETE', ?array $whereEquals = null): bool
{
    if (!deleted_log_validate_table($table)) {
        error_log('deletedLog: rejected non-whitelist table: ' . $table);
        return false;
    }

    $effectiveUser = deleted_log_session_username();
    if ($effectiveUser === '') {
        $effectiveUser = $user;
    }

    try {
        if ($whereEquals === null || $whereEquals === []) {
            $stmt = $conn->prepare('SELECT * FROM `' . $table . '` WHERE `id` = ? LIMIT 1');
            $stmt->execute([$recordId]);
        } else {
            $parts = [];
            $params = [];
            foreach ($whereEquals as $col => $val) {
                if (!is_string($col) || !preg_match('/^[a-zA-Z0-9_]+$/', $col)) {
                    continue;
                }
                $parts[] = '`' . $col . '` = ?';
                $params[] = $val;
            }
            if ($parts === []) {
                return false;
            }
            $sql = 'SELECT * FROM `' . $table . '` WHERE ' . implode(' AND ', $parts) . ' LIMIT 1';
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
        }

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return false;
        }

        $json = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json === false) {
            $json = '{}';
        }

        $ins = $conn->prepare(
            'INSERT INTO `deleted_logs` (`user`, `company_id`, `page`, `table_name`, `record_id`, `action_type`, `ip_address`, `deleted_data`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $effectiveUser,
            deleted_log_company_id_string(),
            $page,
            $table,
            $recordId,
            $actionType,
            deleted_log_client_ip(),
            $json,
        ]);
        return true;
    } catch (Throwable $e) {
        error_log('deletedLog failed: ' . $e->getMessage());
        return false;
    }
}
