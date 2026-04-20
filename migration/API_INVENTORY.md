# PHP → Spring Boot + React 迁移清单（防功能缺失）

本文档用于：**在删除任何 PHP 之前**，逐项对照后端契约与前端调用，避免漏迁。

---

## 1. 如何保证「功能不缺失」

1. **契约优先**  
   每个仍被前端调用的 PHP 端点，在 Spring 中须有：**同等的 HTTP 方法、路径语义、请求参数、JSON 结构（含错误字段）**。迁完后再切换 `resolveApiPath` 的 `REWRITE` 或统一前缀。

2. **并行期**  
   建议 Spring 与 PHP 同库并行跑一段时间：网关或特性开关把部分流量打到 Spring，对比日志与关键报表数字。

3. **验收粒度**  
   - **API**：对「当前前端仍在用的路径」做清单勾选（见第 3 节）。  
   - **页面**：`routeConfig.js` 中每个 `legacyFile` 须在 React 有等价路由与 UI（或明确废弃）。  
   - **非 HTTP**：`login_bootstrap.php`、`session_check.php`、`sidebar.php` 承担的会话/注入逻辑，须由 **Spring 鉴权 + 前端 bootstrap API** 覆盖。

4. **删 PHP 条件（单条）**  
   Spring 实现已上线 + 前端已改调 Spring + 回归通过 + 无其它系统直连该 `.php`。

---

## 2. Spring Boot 当前已实现的 HTTP 能力（仓库现状）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/login` | 登录 JSON |
| POST | `/api/company/verify` | 公司码校验（对应 `api/company/verify_api.php`） |
| GET | `/api/internal/session-bootstrap/{token}` | 登录后 PHP bootstrap 用（内部） |
| POST | `/api/domain` | **部分**：`action`=`get_company_permissions` \| `get_companies`（与 `domain_api.php` JSON 契约对齐）；其余 `action` 返回 **501**，仍走 PHP |

**说明**：其余业务 API 均在 PHP `api/` 下，待迁移。Domain 全量 11 个 action 见 `api/domain/domain_api.php` switch；**未把 `api/domain/domain_api.php` 写入 `resolveApiPath` REWRITE 前**，前端默认仍请求 PHP，避免未完成 action 打到 Spring。

---

## 3. `api/` 下 PHP 文件全量清单（101，迁完前勿删）

以下为相对 `count168test/` 的路径。`*_helper.php` / `api_response.php` / `*_lib.php` 多为被其它 API include，迁 Spring 时并入对应领域服务即可。

### accounts

- `api/accounts/account_company_api.php`
- `api/accounts/account_currency_api.php`
- `api/accounts/account_link_api.php`
- `api/accounts/accountlistapi.php`
- `api/accounts/addaccountapi.php`
- `api/accounts/addcurrencyapi.php`
- `api/accounts/bulk_account_currency_api.php`
- `api/accounts/create_currency_api.php`
- `api/accounts/currencyapi.php`
- `api/accounts/delete_accounts_api.php`
- `api/accounts/delete_currency_api.php`
- `api/accounts/toggle_account_status_api.php`
- `api/accounts/toggle_payment_alert_api.php`
- `api/accounts/update_api.php`

### announcements

- `api/announcements/announcement_create_api.php`
- `api/announcements/announcement_delete_api.php`
- `api/announcements/announcement_get_dashboard_api.php`
- `api/announcements/announcement_list_api.php`
- `api/announcements/announcement_update_api.php`

### auth / company（部分已有 Spring 等价）

- `api/auth/php_login_core.php`（被代理/include，非独立 REST 时可内化）
- `api/auth/spring_login_proxy.php`（过渡用，最终删除）
- `api/company/verify_api.php` → 已有 Spring：`/api/company/verify`

### bankprocess_maintenance

- `api/bankprocess_maintenance/delete_api.php`
- `api/bankprocess_maintenance/maintenance_accounting_resend_lib.php`
- `api/bankprocess_maintenance/resend_accounting_due_api.php`
- `api/bankprocess_maintenance/search_api.php`

### capture_maintenance

- `api/capture_maintenance/delete_api.php`
- `api/capture_maintenance/search_api.php`
- `api/capture_maintenance/update_api.php`

### datacapture_summary

- `api/datacapture_summary/summary_api.php`

### domain

- `api/domain/domain_api.php`

### editdata

- `api/editdata/editdata_api.php`

### formula_maintenance

- `api/formula_maintenance/delete_api.php`
- `api/formula_maintenance/formula_fields_helper.php`
- `api/formula_maintenance/list_api.php`
- `api/formula_maintenance/search_api.php`
- `api/formula_maintenance/update_api.php`

### maintenance

- `api/maintenance/create_api.php`
- `api/maintenance/delete_api.php`
- `api/maintenance/get_public_api.php`
- `api/maintenance/list_api.php`
- `api/maintenance/update_api.php`

### ownership

- `api/ownership/add_external_partner_api.php`
- `api/ownership/add_group_external_partner_api.php`
- `api/ownership/batch_save_group_owners_api.php`
- `api/ownership/batch_save_owners_api.php`
- `api/ownership/get_available_accounts_api.php`
- `api/ownership/get_companies_api.php`
- `api/ownership/get_group_available_accounts_api.php`
- `api/ownership/get_group_earnings_api.php`
- `api/ownership/get_group_owners_api.php`
- `api/ownership/get_owners_api.php`
- `api/ownership/remove_owner_api.php`
- `api/ownership/save_owner_api.php`
- `api/ownership/update_company_group_api.php`
- `api/ownership/update_read_only_api.php`
- `api/ownership/upsert_group_ownership_api.php`

### payment_maintenance

- `api/payment_maintenance/delete_api.php`
- `api/payment_maintenance/search_api.php`
- `api/payment_maintenance/update_api.php`

### processes

- `api/processes/addprocess_api.php`
- `api/processes/addprocessapi.php`
- `api/processes/billing_schedule.php`
- `api/processes/contract_billing_addon.php`
- `api/processes/delete_processes_api.php`
- `api/processes/dismiss_accounting_due_api.php`
- `api/processes/process_accounting_inbox_api.php`
- `api/processes/process_post_to_transaction_api.php`
- `api/processes/processlist_api.php`
- `api/processes/submitted_processes_api.php`
- `api/processes/toggle_process_status_api.php`
- `api/processes/update_bank_issue_flag_api.php`
- `api/processes/update_bank_remark_api.php`

### reports

- `api/reports/customer_report_api.php`
- `api/reports/domain_report_api.php`

### session

- `api/session/update_account_session_api.php`
- `api/session/update_company_session_api.php`

### transactions

- `api/transactions/bank_process_bill_display.php`
- `api/transactions/contra_approve_api.php`
- `api/transactions/contra_inbox_api.php`
- `api/transactions/contra_reject_api.php`
- `api/transactions/dashboard_api.php`
- `api/transactions/get_accounts_api.php`
- `api/transactions/get_categories_api.php`
- `api/transactions/get_company_currencies_api.php`
- `api/transactions/get_currencies_api.php`
- `api/transactions/get_owner_companies_api.php`
- `api/transactions/history_api.php`
- `api/transactions/maintenance_delete_api.php`
- `api/transactions/maintenance_search_api.php`
- `api/transactions/search_api.php`
- `api/transactions/submit_api.php`
- `api/transactions/user_currency_order_api.php`

### useraccess / users

- `api/useraccess/useraccess_api.php`
- `api/users/reset_password_api.php`
- `api/users/send_reset_tac_api.php`
- `api/users/toggle_status_api.php`
- `api/users/user_secondary_password.php`
- `api/users/userlist_api.php`

### 共用

- `api/api_response.php`
- `api/get_companies_helper.php`

---

## 4. 根目录与其它非 `api/` PHP（须单独迁移或下线）

含 `inc/`、`includes/`、入口页、旧 JSON API：

| 类别 | 示例路径 | 备注 |
|------|-----------|------|
| 入口 / 壳 | `index.php`, `sidebar.php`, `login_bootstrap.php` | 由静态 React + Spring 取代 |
| 会话 / 配置 | `session_check.php`, `config.php`, `db.php`, `spring_internal_bases.php` | 配置进 Spring；DB 仅 Java 连 |
| 旧单文件 API | `getaccountapi.php`, `domainapi.php`, `roleapi.php` | 查前端引用后并入 REST |
| 业务页 | `transaction.php`, `datacapture.php`, `account-list.php`, … | 与 `routeConfig.js` 一一对应，迁 React |
| 工具 / 调试 | `check_php_config.php`, `debug_ag110.php`, `scratch_db.php` | 按需迁或删除 |

完整文件数以仓库 `**/*.php` 为准（当前约 141 个）；**第 3 节仅覆盖 `api/` 包内 101 个文件。**

---

## 5. 主要前端调用面（按文件，便于分配任务）

以下用于「谁依赖谁」排查；迁 Spring 后需在对应 `*.js` / `*.jsx` 改 `resolveApiPath` 或基地址。

| 区域 | 主要文件 |
|------|-----------|
| 登录 / 桥接 | `dashboard-web/src/pages/LoginPage.jsx`, `js/index.js`, `js/api-bridge.js`, `dashboard-web/src/lib/resolveApiPath.js` |
| Dashboard | `js/dashboard.js`（`dashboard_api.php`、公司/货币/session 等） |
| 侧栏 | `js/sidebar.js`（公告 API 等） |
| Member | `js/member.js` |
| 账户 | `js/account-list.js`（体量最大之一） |
| 流程 / 银行 | `js/bank_process_list.js`（games 流程等同域） |
| Data capture | `js/datacapture.js` |
| 报表 / 维护 | `js/customer_report.js`, `js/domain_report.js`, `js/capture_maintenance.js`, `js/transaction_maintenance.js`, `js/payment_maintenance.js`, `js/formula_maintenance_v2.js` |

**并行开发建议**：按业务域（session → dashboard → accounts → processes → …）划分支，每合并一条域就在本清单对应小节打勾，并在 `resolveApiPath.js` / `api-bridge.js` 的 `REWRITE` 增加映射，避免漏改调用点。

---

## 6. 维护方式

- 新增 PHP API 时：**先补本文档第 3 节列表**，再实现 Spring 与前端切换。  
- 删除 PHP 时：**从第 3、4 节移除并记录 PR 链接**，便于审计。

---

## 7. 前端 API 引用扫描（自动化）

从 `js/`、`dashboard-web/src` 提取字符串中的 `api/.../*.php`（及少数根级 `*.php`、`api/auth/login`），生成 **`migration/generated/frontend-api-refs.json`**（含文件:行号，便于迁 Spring 时改调用点）。

在 **`count168test`** 目录执行：

```bash
node migration/scripts/scan-frontend-api-refs.mjs
```

迁完一条 Spring 接口后：在 `resolveApiPath.js` / `api-bridge.js` 增加 `REWRITE`，并全局搜该 `api/...` 字符串确认无遗漏。

更新日期：以仓库最后一次编辑本文件为准。
