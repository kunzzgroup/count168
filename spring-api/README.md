# EazyCount Spring Boot API

从 PHP `api/*.php` 逐步迁移的 REST 服务。

## 运行

1. 配置环境变量（**勿**把生产密码提交到 Git）：

```bash
set SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3306/你的库?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Kuala_Lumpur
set SPRING_DATASOURCE_USERNAME=root
set SPRING_DATASOURCE_PASSWORD=你的密码
set SERVER_PORT=8090
set APP_INTERNAL_BOOTSTRAP_KEY=与 PHP 环境变量 APP_INTERNAL_BOOTSTRAP_KEY 相同的随机串
```

Linux/macOS 使用 `export`。

`APP_INTERNAL_BOOTSTRAP_KEY` 须与部署 PHP 时设置的同名变量一致（默认开发值见 `application.yml`），供 `login_bootstrap.php` 拉取一次性会话。

2. 编译运行：

```bash
mvn spring-boot:run
```

3. 健康检查：<http://127.0.0.1:8090/api/health>

## 已实现接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 存活检测 |
| POST | `/api/company/verify` | 表单字段 `company_id`，对应原 `api/company/verify_api.php` |
| POST | `/api/auth/login` | 登录（原 `login_process.php`），成功返回 `bootstrapToken`，再由 `login_bootstrap.php` 写 PHP Session |
| GET | `/api/internal/session-bootstrap/{token}` | 仅服务端：PHP 用请求头 `X-Eazycount-Internal` 拉取会话载荷 |

## 前端对接

- 环境变量 `SPRING_API_BASE`（PHP `index.php` 注入 `window.__API_BASE_URL__`）或 `VITE_API_BASE_URL`（Vite）设为 Spring 根地址，例如 `http://127.0.0.1:8090`（无尾斜杠）。**未设置时浏览器无法访问 Spring 登录接口**，需反代或填此变量。
- PHP 另需 `APP_INTERNAL_BOOTSTRAP_KEY`（与 Spring 一致），供根目录 `login_bootstrap.php` 调用内部接口。
- `js/api-bridge.js` 中 `REWRITE` 表：仅列出的 PHP 路径会转到 Java，其余仍请求原 PHP。

## 安全说明

当前 `SecurityConfig` 为开发便利对全部请求 `permitAll`。生产环境请改为 JWT / Session 并收紧 CORS。
