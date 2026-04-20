# Count.site：PHP 页面 → React 迁移计划

## 1. 现状概览

| 类别 | 数量（约） | 说明 |
|------|------------|------|
| 根目录 `*.php` 页面 | ~35 | 登录、业务页、报表、维护等 |
| `api/**/*.php` | ~100+ | JSON 接口，供页面与脚本调用 |
| 共享片段 | `sidebar.php`、`session_check.php`、`includes/*` | 布局、鉴权、工具 |
| 配置/库 | `config.php`、`db.php` | 不可由 React 直接替代 |

**结论**：「所有 PHP 改成 React」在严格意义上 = **前端全部 SPA 化 + 后端不再用 PHP**（你之前目标的 Spring Boot）。仅改 `.php` 页面而不迁 API，PHP 运行时仍必须存在。

---

## 2. 目标架构（推荐）

```
浏览器 → 静态 React 构建产物（或 CDN）
         ↓ fetch / cookie
       Spring Boot REST API（最终）
         ↓
       MySQL（现有库表）
```

**过渡期**（常见）：React 仍请求 **同源 `/api/*.php`**，`credentials: 'include'`，直到接口逐条迁到 Java。

---

## 3. 分阶段路线

### Phase 0 — 工程骨架（已落地）

- 单一 Vite 应用：`dashboard-web/`
- **HashRouter**（`#/dashboard`、`#/login` …）免改服务器即可 deep link
- `src/routeConfig.js`：根目录业务页与路由对照；未迁移页用 `PlaceholderPage` + 链回对应 `.php`
- `src/App.jsx`：注册全部路由；`/dashboard` → 现有 `DashboardPage`；`/` 重定向到 `/dashboard`
- `dashboard.php` 仍注入 `dashboard-app/assets/dashboard-react.js`，侧栏继续由 PHP `include sidebar.php` 提供，直到 Phase 1 用 React 侧栏替换

**本地预览 SPA（无 PHP 侧栏）**：`cd dashboard-web && npm run dev`，浏览器打开 `http://localhost:5173/#/dashboard`（需自行代理 `/api` 等到后端，见 `vite.config.js`）。

### Phase 1 — 认证与壳

- `index.php`、`login_process.php` → `/login` React 页 + 仍调现有登录 API（或 Spring 登录）
- `owner_secondary_password.php` → 独立路由
- 侧栏：`sidebar.php` → `Sidebar.jsx`（菜单数据来自 `/api/me` 类接口或内嵌 JSON）

### Phase 2 — 核心业务页（按流量与依赖排序）

建议顺序（可按你业务调整）：

1. `member.php`
2. `transaction.php`、`processlist.php`
3. `datacapture.php`、`datacapturesummary.php`
4. `account-list.php`、`add-account.php`
5. 报表：`customer_report.php`、`domain_report.php`
6. 各类 `*_maintenance.php`、`bank_process_list.php`、`games_process_list.php`
7. `ownership.php`、`userlist.php`、`useraccess.php`、`permissions.php`、`announcement.php`、`domain.php`
8. 运维/杂项：`auto_monthly_accounting.php`、`reset-password.php` 等

每迁一页：**删或 302 对应 PHP**，路由指向 React 实现。

### Phase 3 — API 与下线 PHP

- 为每个 `api/**/*.php` 建立 **OpenAPI / 对照表** → Spring Controller
- 会话：Session Cookie → JWT 或 Spring Session，与前端约定一致
- 无引用后：移除 `api/`、根目录业务 `*.php`、`login_process.php` 等

### Phase 4 — 部署

- 构建产物：`npm run build` → 静态目录
- Nginx：`try_files $uri /index.html`（若改用 BrowserRouter + `basename`）
- 或继续 Hash 路由，对服务器要求更低

---

## 4. 风险与约束

- **会话与跨域**：开发与生产需统一 `SameSite`、HTTPS、Cookie 路径。
- **member / owner 分流**：逻辑须在 **后端校验**；前端只做展示与跳转。
- **并行期**：新旧 URL 并存时，用清单与 301 避免死链。

---

## 5. 验收标准（「可以移除 PHP」）

- [ ] 无浏览器请求指向业务 `.php` 页面  
- [ ] 无前端依赖 `api/*.php`（或仅保留短期兼容代理）  
- [ ] 登录、权限、公司切换与现网行为一致（对照测试清单）  

---

## 6. 本仓库中的执行物

- 路由占位：`dashboard-web/src/pages/*`  
- 路由表：`dashboard-web/src/routeConfig.js`  
- 构建输出：`count168test/dashboard-app/`  

每次改路由或页面后执行：`cd dashboard-web && npm run build`。
