<?php
/**
 * C168 公司下可访问 Domain / Announcement（侧栏与对应页）的账号角色。
 * 仅当「当前选中公司为 C168」时生效；切换非 C168 公司后由 session / bootstrap 关闭。
 *
 * superviser：兼容历史拼写
 */
function eazycount_c168_sidebar_staff_roles(): array
{
    return ['owner', 'admin', 'partnership', 'supervisor', 'superviser', 'manager'];
}

function eazycount_is_c168_sidebar_staff_role(?string $role): bool
{
    $r = strtolower(trim((string) $role));
    return in_array($r, eazycount_c168_sidebar_staff_roles(), true);
}

/** 二级密码等敏感操作：仍仅 owner / admin */
function eazycount_c168_owner_admin_roles(): array
{
    return ['owner', 'admin'];
}

function eazycount_is_c168_owner_or_admin(?string $role): bool
{
    $r = strtolower(trim((string) $role));
    return in_array($r, eazycount_c168_owner_admin_roles(), true);
}
