# Dashboard React + PHP API

## 目标架构

- 前端：`dashboard-frontend`（React + Vite SPA）
- 后端：`/api/*.php`（仅返回 JSON）
- 页面入口：`/dashboard.php` 仅做登录校验并跳转到 SPA，不再输出 HTML

## 本地开发

1. 进入前端目录并安装依赖：

```bash
cd dashboard-frontend
npm install
```

2. 启动开发服务器：

```bash
npm run dev
```

3. 前端默认通过 Vite 代理访问 `/api/*` 到：

- `http://localhost/count168test/api/*`

如果你的 PHP 项目路径不是 `count168test`，请修改 `vite.config.js` 里的 `server.proxy["/api"].target`。

## 生产发布

1. 构建前端：

```bash
cd dashboard-frontend
npm run build
```

2. 构建产物会输出到：

- `dashboard-frontend/dist`

3. 访问 `dashboard.php` 时，系统会跳转到：

- `/dashboard-frontend/dist/index.html`

## API 说明

- 读取看板数据：`GET /api/dashboard.php`
- 批量保存：`POST /api/batch_save.php`

请求和响应均为 JSON。
