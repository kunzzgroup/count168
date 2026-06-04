# migrations/

增量脚本已归档到 **`archive/migrations/`**（`01`–`04`）。

当前建库方式：

1. **生产 / 带数据**：`dumps/` + [HOSTINGER_IMPORT.md](../HOSTINGER_IMPORT.md)
2. **本地空库结构**：`schema/easycount_fresh_install.sql` 或 `schema/easycount_schema.sql`
3. **仅缺交易金额触发器**（未导入 routines dump 时）：`schema/triggers_transactions_amount_guard.sql`

## Dual-tenant（Group 登录）— 生产库必跑顺序

若已部署 Group 登录代码，在**同一数据库**上按顺序执行（可重复执行）：

1. `20260528_dual_tenant_company_group.sql` — 建 `groups`、`scope_type`/`scope_id` 等列
2. `20260604_group_tenant_bootstrap.sql` — **不**向 `company` 插入 `AP`/`IG`；集团只在 `groups`。修正 `account_company.scope_type=group`、`tenant_module_policy`、`user_group_map`。

3. （可选）`20260605_remove_group_entity_company_rows.sql` — 若库里已有 migration 插入的 `company_id=AP/IG` 行，用此脚本把集团账户改挂到首家子公司并删除实体行。

   部署 PHP 后集团 API 用 `groups.id` + `scope_type=group` 查账；`company` 表只保留真实公司码（95、CX…）。

或在 Domain 里对 BOSS 等 owner **重新保存一次**（会调用 `domainApiBootstrapOwnerGroupTenants`）。

请勿在新环境上执行 `archive/migrations/` 里的脚本；内容与 `easycount_schema` 重复，且可能报错。
