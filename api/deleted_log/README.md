# Deleted log (PHP services)

Moved from `includes/deleted_log*.php`. Used by delete/restore APIs and `deleted_log_list_api.php`.

| File | Role |
|------|------|
| `deleted_log.php` | `deletedLog()` — snapshot row before DELETE |
| `deleted_log_display.php` | List row summary / Acc ID / page labels |
| `deleted_log_entry_sources.php` | Entry-tab filter definitions (SPA source) |
| `deleted_log_page_scope.php` | Company visibility scope for list query |

Frontend: `frontend/src/pages/deletedlog/DeletedLogPage.jsx` → `GET api/deleted_log_list_api.php`.

## Entry tabs ↔ 物理删除入口

| Tab key | SPA / 功能 | API `page` 值 |
|---------|------------|---------------|
| `account` | Account List | `/api/accounts/delete_*` / currency / link / company |
| `txn_maint` | Transaction Maintenance | `/api/transactions/maintenance_delete_api.php` |
| `payment` | Payment Maintenance | `/api/payment_maintenance/delete_api.php` |
| `bank_maint` | Bank Process Maintenance | `/api/bankprocess_maintenance/delete_api.php` |
| `capture` | Capture Maintenance | `/api/capture_maintenance/delete_api.php` |
| `formula` | Formula Maintenance | `/api/formula_maintenance/delete_api.php` |
| `process` | Process List（物理删 Bank Process） | `/api/processes/delete_processes_api.php` |
| `ownership` | Ownership | `/api/ownership/remove_owner_api.php` |
| `auto_renew` | Auto Renew | `/api/subscription/auto_renew_api.php` |
| `marquee` | Announcement / Marquee | `/api/maintenance/delete_api.php` |

**不进 Deleted Log**：Games Process soft-delete（`waiting`）、只写旁路表而无 `deletedLog()` 的路径、Payment History（业务历史非删除审计）。

## 新删除入口 checklist

1. 删前调用 `deletedLog($pdo, $user, $pageTag, $table, $recordId, …)`（表须在白名单）
2. `$pageTag` 固定为该 API 路径（如 `/api/.../delete_api.php`）
3. 把 `$pageTag` 加入 `deleted_log_entry_sources.php` 对应 tab
4. 在 `deleted_log_display_page_label()` 增加用户可读标签
