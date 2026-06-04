# migrations/

增量脚本已归档到 **`archive/migrations/`**（`01`–`04`）。

当前建库方式：

1. **生产 / 带数据**：`dumps/` + [HOSTINGER_IMPORT.md](../HOSTINGER_IMPORT.md)
2. **本地空库结构**：`schema/easycount_fresh_install.sql` 或 `schema/easycount_schema.sql`
3. **仅缺交易金额触发器**（未导入 routines dump 时）：`schema/triggers_transactions_amount_guard.sql`

## Dual-tenant（Group 登录）— 生产库必跑顺序

若已部署 Group 登录代码，在**同一数据库**上按顺序执行（可重复执行）：

1. `20260528_dual_tenant_company_group.sql` — 建 `groups`、`scope_type`/`scope_id` 等列
2. `20260604_group_tenant_bootstrap.sql` — 创建集团实体公司行（`company_id` = `AP`/`IG`）、修正 `account_company` 的 group 账本 scope、开启集团模块策略

   `company.company_id` 为**全局唯一**。若某 `group_code`（如 `T1`）已被其它 owner 的公司占用，迁移会跳过插入该行，仅对**同 owner** 且 `company_id = group_code` 的现有行做 UPDATE；需在 Domain 中改名或手工处理冲突。

或在 Domain 里对 BOSS 等 owner **重新保存一次**（会调用 `domainApiBootstrapOwnerGroupTenants`）。

请勿在新环境上执行 `archive/migrations/` 里的脚本；内容与 `easycount_schema` 重复，且可能报错。
