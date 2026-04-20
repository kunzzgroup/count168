# EazyCount Spring Boot API

从 PHP `api/*.php` 逐步迁移的 REST 服务。

## 运行

1. 配置环境变量（**勿**把生产密码提交到 Git）：

```bash
set SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3306/你的库?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Kuala_Lumpur
set SPRING_DATASOURCE_USERNAME=root
set SPRING_DATASOURCE_PASSWORD=你的密码
set SERVER_PORT=8090
```

Linux/macOS 使用 `export`。

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

## 前端对接

- 环境变量 `SPRING_API_BASE`（PHP）或 `VITE_API_BASE_URL`（Vite）设为 Spring 根地址，例如 `http://127.0.0.1:8090`（无尾斜杠）。
- `js/api-bridge.js` 中 `REWRITE` 表：仅列出的 PHP 路径会转到 Java，其余仍请求原 PHP。

## 安全说明

当前 `SecurityConfig` 为开发便利对全部请求 `permitAll`。生产环境请改为 JWT / Session 并收紧 CORS。
