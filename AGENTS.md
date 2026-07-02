# AGENTS.md — count168test 项目指南

供 Cursor Agent 快速理解本仓库。改代码前请先读本文 + 对应模块的 `README.md`。

## 产品是什么

**EazyCount / count168** — 多租户账房系统：数据录入（Data Capture）、交易收付款、持股、流程、报表、维护后台。

- 前端：React 18 SPA（`frontend/`）
- 后端：无框架 PHP + PDO MySQL（`api/`、`includes/`）
- 时区：`Asia/Kuala_Lumpur`（PHP + MySQL `+08:00`）

## 目录地图

| 路径 | 用途 |
|------|------|
| `frontend/src/pages/{domain}/` | 页面 UI、hooks、组件 |
| `frontend/src/utils/` | 路由、API URL、公司过滤器、权限 |
| `api/{domain}/` | JSON API 端点（`*_api.php`） |
| `api/includes/` | API 层共享 PHP（金额、审批等） |
| `includes/` | 全局 PHP：config、session、权限、多租户 |
| `database/schema/` | 建表 SQL |
| `database/migrations/` | 增量迁移（日期前缀 `YYYYMMDD_`） |
| `cron/` | 定时备份与记账任务 |
| `deploy/` | Nginx、EC2 部署脚本 |
| `docs/` | 项目文档（含 `mcp-setup.md`） |

## 改什么 → 去哪改

| 任务 | 首选位置 |
|------|----------|
| 页面 UI / 交互 | `frontend/src/pages/{domain}/` |
| 路由 / 导航 | `frontend/src/utils/routing/pageRoutes.js`、`App.jsx` |
| API 逻辑 | `api/{domain}/*_api.php` |
| 认证 / 权限 / 租户 | `includes/permissions.php`、`tenant_scope.php`、`group_company_access.php` |
| 表结构 | `database/schema/*.sql` + `database/migrations/` |
| 部署 | `deploy/`、`frontend/dist/` |

**复杂模块先看目录内 README**（如 `frontend/src/pages/datacapture/README.md` 有「改什么去哪个文件」表）。

## 前端约定

- 路由：`spaPath(pageKey)` → `/{page}/{fixed-uuid}`（见 `pageRoutes.js`）
- 鉴权页面包在 `AuthenticatedLayout`；公开页（login 等）直接渲染
- 数据请求：TanStack Query + `utils/core/apiUrl.js`
- 公司上下文：`sharedCompanyFilter.js`；session 由 PHP cookie 维护
- 金额：`decimal.js`（`money/decimalEngine.js`），禁止用 JS 浮点直接算钱
- 样式：Tailwind 4 + `frontend/public/css/` 遗留 CSS 并存
- 改 `frontend/` 后必须 `cd frontend && npm run build`

## API 约定

- 入口：`require_once __DIR__ . '/../../includes/config.php'` → 获得 `$pdo`
- 本地凭据覆盖：`includes/config.local.php`（勿提交）
- 认证方式不统一，改前先读该文件：
  - `includes/session_check.php`（完整校验）
  - 或自行 `session_start()` + `$_SESSION['user_id']`
- 响应格式：
  - 新：`api/api_response.php` → `{ success, message, data }`
  - 旧：`{ status: 'error'|'ok', message }`（混用存在，勿强行统一除非任务要求）
- Scope 公共文件：`transaction_scope.php`、`data_capture_scope_common.php`、`report_scope_common.php`

## 数据库约定

- MySQL 8，`utf8mb4`；金额 `DECIMAL(25,8)`
- 本地空库：`database/schema/easycount_schema.sql`
- **勿跑** `database/archive/migrations/`（已废弃）
- 双租户：`groups` + `group_company_map`；集团登录 vs 公司登录
- 核心表：`company`, `account`, `transactions`, `process`, `submitted_processes`, `data_captures`, `user`, `user_company_permissions`, `ownership_*`

## 业务模块索引

| 模块 | 前端 | API |
|------|------|-----|
| Data Capture | `pages/datacapture/` | `api/datacapture/` |
| Data Capture Summary | `pages/datacapturesummary/` | `api/datacapture_summary/` |
| Transaction | `pages/transaction/` | `api/transactions/` |
| Process / Bank Process | `pages/processlist/`, `bankprocesslist/` | `api/processes/` |
| Ownership | `pages/ownership/` | `api/ownership/` |
| Domain / 公司设置 | `pages/domain/` | `api/domain/` |
| Dashboard | `pages/dashboard/` | `api/transactions/dashboard_*.php` |
| Maintenance (5类) | `pages/maintenance/*/` | `api/*_maintenance/` |
| Reports | `pages/report/` | `api/reports/` |
| Accounts / Users | `pages/account/`, `userlist/` | `api/accounts/`, `api/users/` |

## 多租户与权限（易踩坑）

- `$_SESSION['company_id']` / `company_code` 决定数据范围
- 集团视图：`view_group`、`group_id`；`group_only` 会剥离 `company_id`
- 角色：`owner`, `partnership`, `audit`（只读）, `member`
- 细粒度权限：`user_company_permissions.account_permissions` JSON
- C168 域：`api/c168/c168_domain_access.php`

## 构建与部署

```bash
cd frontend && npm run build   # 产物 → frontend/dist/
```

- 本地 dev：Vite 代理 `/api` → `VITE_PHP_PROXY_TARGET`（默认 `127.0.0.1:8000`）
- EC2：`push main` → `.github/workflows/deploy-ec2.yml` → `deploy/deploy.sh`
- Nginx：`/api/*.php` 走 PHP-FPM；其余 fallback 到 `frontend/dist/index.html`

## Agent 工作建议

1. **先定位模块** — 读 `AGENTS.md` + 该模块 `README.md`，再改代码
2. **最小改动** — 匹配现有命名与模式，不引入新框架
3. **数据问题** — 用 MCP MySQL 查真实表数据（见 `docs/mcp-setup.md`）
4. **API 问题** — 读端点 PHP + 用 MCP fetch 测请求
5. **前端改动** — build 通过后再结束
6. **勿提交** — `config.local.php`、`.env`、`frontend/dist`、密钥

## 相关文档

- MCP 配置：`docs/mcp-setup.md`
- 数据库：`database/README.md`
- 部署：`deploy/NGINX_DEPLOY.md`
- 各页面：`frontend/src/pages/*/README.md`
