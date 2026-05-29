# count168 Nginx 部署指南（方案 A）

保持现有构建路径 `/frontend/dist/`，整站上传 + Nginx 替代 Apache `.htaccess`。

## 1. 本地打包前端

```bash
cd frontend
npm run build
```

确认存在 `frontend/dist/index.html` 和 `frontend/dist/assets/`。

## 2. 上传到服务器

用 SFTP / SCP 把整个项目上传到服务器，例如 **`/var/www/count168/`**。

**必须包含：**

| 路径 | 说明 |
|------|------|
| `api/` | PHP 接口 |
| `includes/` | 数据库配置（部署前改 `config.php`） |
| `frontend/dist/` | React 构建产物（保持子目录名） |
| `images/`、`js/` | 静态资源 |
| `favicon.ico` | 站点图标 |

**不要**只把 `dist/` 里的文件平铺到 Nginx 根目录。

**不要**上传：`node_modules/`、`.git/`、`frontend/src/`（可选，生产不必传源码）。

## 3. 配置数据库

编辑服务器上的 `includes/config.php`，填入该服务器的 MySQL 主机、库名、用户名、密码。

数据库导入步骤见 [`database/HOSTINGER_IMPORT.md`](../database/HOSTINGER_IMPORT.md)。

## 4. 安装 PHP

```bash
# Debian/Ubuntu 示例
sudo apt update
sudo apt install nginx php-fpm php-mysql php-mbstring php-xml php-curl
```

确认 php-fpm socket 路径（常见之一）：

```bash
ls /run/php/php*-fpm.sock
```

## 5. PHP 大 POST 限制

Apache 的 `.htaccess` 里有 `post_max_size=64M` 等设置；Nginx 需在 **php.ini** 或 pool 配置里设置：

```ini
post_max_size = 64M
upload_max_filesize = 64M
max_input_vars = 5000
max_input_time = 300
max_execution_time = 300
memory_limit = 256M
```

本仓库 Nginx 配置已设 `client_max_body_size 64M;`。

改完后：`sudo systemctl restart php8.2-fpm`（版本号按实际）。

## 6. 启用 Nginx 站点

```bash
# 复制并编辑配置
sudo cp deploy/nginx/count168.site.conf /etc/nginx/sites-available/count168.site
sudo nano /etc/nginx/sites-available/count168.site
# 修改: root、server_name、fastcgi_pass（php-fpm socket）

sudo ln -sf /etc/nginx/sites-available/count168.site /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # 可选：去掉默认 Welcome 页

sudo nginx -t
sudo systemctl reload nginx
```

## 7. 验证

| URL | 预期 |
|-----|------|
| `https://count168.site/` | 302 到 `/login` |
| `https://count168.site/member` | React 会员页（不是 nginx 默认页） |
| `https://count168.site/frontend/dist/assets/` | JS/CSS 200 |
| 浏览器 Network → `/api/session/current_user_api.php` | JSON 响应 |

## 8. 日常更新前端

```bash
cd frontend && npm run build
```

只上传 **`frontend/dist/`** 目录覆盖服务器同名目录即可；PHP 未改则不必重传 `api/`。

## 常见问题

**仍显示 “Welcome to nginx!”**  
默认站点还在生效，或 `root` 指错目录。检查 `sites-enabled/` 并确认 `root` 为 `/var/www/count168`。

**页面白屏 / CSS 404**  
检查 `frontend/dist/css/` 是否上传完整；浏览器 F12 看是否请求 `/frontend/dist/...` 返回 404。

**API 502**  
`fastcgi_pass` socket 路径不对，或 php-fpm 未运行：`systemctl status php8.2-fpm`。

**登录失败 / 数据库错误**  
检查 `includes/config.php` 与 MySQL 是否已导入。
