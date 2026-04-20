# Dashboard React + PHP API 迁移说明

## 当前架构

- 前端：`dashboard-frontend`（React + Vite SPA）
- 后端：`api/transactions/*.php`、`api/session/*.php`（JSON API）
- 入口：`dashboard.php` 仅做 session/权限校验后跳转至 SPA 构建产物

## 关键入口与接口

- 页面入口：`/dashboard.php`
- 会话信息：`/api/session/me.php`
- 切换公司：`/api/session/update_company_session_api.php`
- 获取公司：`/api/transactions/get_owner_companies_api.php`
- 获取币种：`/api/transactions/get_company_currencies_api.php`
- 看板数据：`/api/transactions/dashboard_api.php`

## 本地开发

1. 安装 Node.js（需包含 `npm`）
2. 执行：

```bash
cd dashboard-frontend
npm install
npm run dev
```

3. 开发代理目标（见 `dashboard-frontend/vite.config.js`）：

- `http://localhost/count168test`

## 生产发布

1. 构建前端：

```bash
cd dashboard-frontend
npm run build
```

2. 部署 `dashboard-frontend/dist` 到服务器
3. 访问 `dashboard.php`，会自动跳转到 `dashboard-frontend/dist/index.html`

## 兼容说明

- 旧版 Dashboard 的 Group/Company/Currency 过滤行为已迁移到 React
- Group 过滤支持 sessionStorage 持久化（刷新后保留）
- Group 的 `All` 模式使用前端并行请求并合并公司数据，口径对齐旧版脚本

## 回滚方案

如需临时回滚到旧版页面渲染：

1. 将 `dashboard.php` 恢复为历史版本（恢复 HTML+JS 输出）
2. 保留现有 `api/transactions/*.php` 不动（不影响旧版）
3. 前端目录 `dashboard-frontend` 可保留，不会影响 PHP 运行

建议回滚前先打 tag，便于快速恢复。
