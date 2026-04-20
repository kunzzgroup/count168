<?php
/**
 * C168 平台管理角色白名单：Domain、Announcement 等共用。
 * 与 userlist 下拉框及 api/users/userlist_api.php 的 $validRoles 对齐，并包含 owner（非下拉创建）。
 */
function c168DomainPageAllowedRoles(): array
{
    return [
        'owner',
        'partnership',
        'admin',
        'manager',
        'supervisor',
        'accountant',
        'audit',
        'customer service',
        'company',
    ];
}

function userHasC168DomainPageAccess(string $roleLower): bool
{
    return in_array(strtolower(trim($roleLower)), c168DomainPageAllowedRoles(), true);
}

/** 公告管理与 Domain 同一白名单 */
function userHasC168AnnouncementPageAccess(string $roleLower): bool
{
    return userHasC168DomainPageAccess($roleLower);
}
