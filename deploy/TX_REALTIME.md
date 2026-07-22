# Transaction Payment 实时同步（SSE + 可选 Redis）

一边 Submit（APPROVED）后，其他开着 Transaction Payment 的浏览器经 SSE 收到 `ledger_changed`，静默重搜列表（约 &lt;1s）。`PENDING` 不广播。

## 组件

| 组件 | 路径 |
|------|------|
| Node SSE hub | `services/tx-realtime/server.mjs` |
| PHP publish | `api/includes/ledger_realtime.php`（submit / contra approve） |
| Ticket API | `api/transactions/realtime_ticket_api.php` |
| 前端订阅 | `frontend/src/pages/transaction/lib/transactionRealtime.js` |
| systemd | `deploy/systemd/tx-realtime.service` |

单机 EC2：**可不装 Redis**（进程内 fanout）。多实例时再设 `REDIS_URL`。

## EC2 部署（推荐：Windows WinSCP 一键）

在仓库根目录（已装 WinSCP，私钥默认 `%USERPROFILE%\.ssh\Server_Key.pem`）：

```powershell
powershell -ExecutionPolicy Bypass -File deploy\winscp-deploy-ec2.ps1
```

脚本会：`npm run build` → WinSCP 同步 `frontend/dist` / `api` / `services/tx-realtime` / `deploy` → 远端跑 `deploy/deploy-realtime.sh`（生成 secret、systemd、nginx `/realtime/`）。

可选参数：`-SkipBuild`、`-SkipRealtime`。本地覆盖：`deploy/local/winscp-ec2.ps1`（已 gitignore）。

### 仅在 EC2 上手动启用 SSE

```bash
# 代码已在 /var/www/count168 后：
bash /var/www/count168/deploy/deploy-realtime.sh
curl -s http://127.0.0.1:3911/health
```

可选 Redis（多实例时）：`sudo dnf install -y redis` 后在 `services/tx-realtime/.env` 设 `REDIS_URL`。

## 本地开发

```bash
cd services/tx-realtime
cp .env.example .env   # 设置 TX_REALTIME_SECRET
npm install
npm run dev
```

`includes/config.local.php` 设同一 `$tx_realtime_secret`。未设置 secret 时 realtime **自动关闭**（Submit 不受影响）。

## 验收

1. 两浏览器同公司、Capture Date 含交易日  
2. A Submit 当天 PAYMENT → B 不点 Search，约 1s 内表格更新  
3. PENDING 账 B 不可见；审批通过后 B 更新  
4. B 在 submit-focus 时保持窄列表（仅 focus 账户行更新）
