<?php
/**
 * Resolve whether the login form identifier is a company code or a group id.
 * If both match (e.g. AP exists as company_id and group_id), prefer group scope
 * so Group login opens in group context instead of pinning a company.
 */
function resolve_login_identifier_scope(PDO $pdo, string $loginInput): array
{
    $id = strtoupper(trim($loginInput));
    if ($id === '') {
        return ['scope' => 'company', 'identifier' => ''];
    }

    $stmt = $pdo->prepare('SELECT 1 FROM company WHERE UPPER(company_id) = ? LIMIT 1');
    $stmt->execute([$id]);
    $hasCompanyCode = (bool) $stmt->fetchColumn();

    $stmt = $pdo->prepare('SELECT 1 FROM company WHERE UPPER(TRIM(group_id)) = ? LIMIT 1');
    $stmt->execute([$id]);
    $hasGroupId = (bool) $stmt->fetchColumn();

    if ($hasGroupId) {
        return ['scope' => 'group', 'identifier' => $id];
    }

    if ($hasCompanyCode) {
        return ['scope' => 'company', 'identifier' => $id];
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
