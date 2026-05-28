<?php
/**
 * Resolve whether the login form identifier is a company code or a group id.
 * Company codes take precedence when both could match.
 */
function resolve_login_identifier_scope(PDO $pdo, string $loginInput): array
{
    $id = strtoupper(trim($loginInput));
    if ($id === '') {
        return ['scope' => 'company', 'identifier' => ''];
    }

    $stmt = $pdo->prepare('SELECT 1 FROM company WHERE UPPER(company_id) = ? LIMIT 1');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn()) {
        return ['scope' => 'company', 'identifier' => $id];
    }

    $stmt = $pdo->prepare('SELECT 1 FROM company WHERE UPPER(TRIM(group_id)) = ? LIMIT 1');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn()) {
        return ['scope' => 'group', 'identifier' => $id];
    }

    return ['scope' => 'company', 'identifier' => $id];
}

function persist_login_filter_scope(PDO $pdo, string $loginInput): void
{
    $resolved = resolve_login_identifier_scope($pdo, $loginInput);
    $_SESSION['login_scope'] = $resolved['scope'];
    $_SESSION['login_identifier'] = $resolved['identifier'];
    unset($_SESSION['login_group_id']);
    unset($_SESSION['accessible_group_ids']);

    if ($resolved['scope'] === 'company' && $resolved['identifier'] !== '') {
        $stmt = $pdo->prepare(
            'SELECT UPPER(TRIM(group_id)) AS group_id FROM company WHERE UPPER(company_id) = ? LIMIT 1'
        );
        $stmt->execute([$resolved['identifier']]);
        $gid = $stmt->fetchColumn();
        $_SESSION['login_group_id'] = ($gid !== false && $gid !== null && trim((string) $gid) !== '')
            ? strtoupper(trim((string) $gid))
            : '';
    }
}
