# C168 手机特别版（count168test 子目录）

手机版前端在 `c168_mobile/frontend/`，后端与桌面版**共用**根目录的 `api/`、`includes/`、`images/`（同一数据库、同一登录会话）。

## 线上（count168.site）

- 访问：`https://count168.site/c168_mobile/`
- 代码目录：`/var/www/count168/c168_mobile/`
- 数据库：使用 `/var/www/count168/includes/config.local.php`（与桌面版相同，手机版无需单独配置）
- Nginx 路由已写在 `deploy/nginx/count168.site.amazon-linux.conf`（HTTPS 环境请同步到 `count168.site-le-ssl.conf`）

推送 `main` 后 GitHub Actions 会部署整个 `count168test` 仓库；确保已 `npm run build` 并提交 `c168_mobile/frontend/dist/`。

## 本地开发

### 1. 安装与构建

```powershell
cd c168_mobile\frontend
npm install
npm run build
```

### 2. 后端联接（XAMPP / 本地 Apache，首次执行）

在 `c168_mobile` 目录：

```powershell
.\scripts\setup-junctions.ps1
```

会创建 `api`、`includes`、`images` 指向上一级（`count168test` 根目录）。

### 3. 数据库

编辑 **`includes/config.local.php`**（与桌面版共用）：

```powershell
copy includes\config.local.php.example includes\config.local.php
# 填入本机 MySQL 主机、库名、用户、密码
```

### 4. 开发模式（热更新）

```powershell
cd c168_mobile\frontend
npm run dev
```

打开 **http://localhost:5174/**（API 代理到 `http://127.0.0.1/c168_mobile`，需 XAMPP 将站点映射到含 `c168_mobile` 的路径）。

### 5. 本地 Apache 访问

若整站放在 `htdocs/count168test`，可把 `htdocs/c168_mobile` 联接为本目录：

```powershell
cmd /c mklink /J C:\xampp\htdocs\c168_mobile "C:\path\to\count168test\c168_mobile"
```

然后访问 **http://localhost/c168_mobile/**

## EC2 首次部署手机版后（可选）

Nginx 已转发 `/c168_mobile/api/` → `/api/`，一般不必建联接。若需本地文件路径一致：

```bash
bash /var/www/count168/c168_mobile/scripts/setup-symlinks.sh
```

## 目录说明

| 路径 | 说明 |
|------|------|
| `c168_mobile/frontend/src/` | 手机版 React 源码 |
| `c168_mobile/frontend/dist/` | 构建产物（需提交） |
| `c168_mobile/api/` | 联接 → `../api`（git 忽略） |
| `includes/config.php` | 默认数据库参数 |
| `includes/config.local.php` | 本地/服务器真实密码（git 忽略） |
