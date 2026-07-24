# count168.com — EC2 部署 + 独立数据库

目标：与现有 **count168.site** / **count168.org** 同机并存，但 **代码目录、Nginx、数据库完全分开**。

| 项 | 值 |
|----|-----|
| GitHub | https://github.com/kunzzgroups/count168 |
| 代码目录 | `/var/www/count168.com` |
| 域名 | `count168.com` / `www.count168.com` |
| 数据库 | `c168_com`（用户 `c168_com`）— **禁止**共用 `u857194726_c168site` |
| Actions | push `main` → SSH → `bash /var/www/count168.com/deploy/deploy.sh` |
| Secrets | `EC2_HOST` / `EC2_USER`=`ec2-user` / `EC2_SSH_KEY`（可与 .site 同机同密钥） |

同机参考：`.site` → `/var/www/count168`；`.org` → `/var/www/count168.org`（`default_server`）；`.net` → `/var/www/count168.net`。**`.com` 不要 `default_server`。**

---

## 一、DNS + 安全组

| 域名 | 记录 | 指向 |
|------|------|------|
| `count168.com` / `www.count168.com` | A | EC2 **公网 IPv4**（例：`56.68.48.190`） |

安全组入站：`22`（你的 IP）、`80`、`443`（`0.0.0.0/0`）。

---

## 二、首次 clone + Nginx（同机已有 nginx/php 时）

EC2 Instance Connect / SSH：

```bash
sudo dnf install -y git
sudo git clone --branch main --depth 1 https://github.com/kunzzgroups/count168.git /var/www/count168.com
sudo chown -R ec2-user:nginx /var/www/count168.com

sudo cp /var/www/count168.com/deploy/nginx/count168.com.amazon-linux.conf /etc/nginx/conf.d/count168.com.conf
sudo sed -i 's/ default_server//g' /etc/nginx/conf.d/count168.com.conf
sudo nginx -t && sudo systemctl reload nginx
```

全新机（未装过 nginx/php）可直接：

```bash
cd /var/www/count168.com   # 或先 clone 再 cd
sudo bash deploy/ec2-amazon-linux-setup.sh
```

---

## 三、独立数据库（必做）

### 3A — 空库起步（推荐新环境）

```bash
sudo bash /var/www/count168.com/deploy/create-com-database.sh
# 记下脚本打印的 DB_PASS
```

会创建：

- 库：`c168_com`
- 用户：`c168_com`@localhost / 127.0.0.1
- 若尚无 `includes/config.local.php`，会从 example 生成并写入密码

然后按需导入 schema / 迁移（见仓库 `database/`）。

### 3B — 从 count168.site 复制一份数据（可选）

```bash
sudo IMPORT_FROM_SITE=1 COM_DB_PASS='你的强密码' \
  bash /var/www/count168.com/deploy/create-com-database.sh
```

会 `mysqldump` 现有 `u857194726_c168site` 再导入 `c168_com`。之后两库独立演化，互不影响。

### 3C — 手动核对 config

```bash
sudo nano /var/www/count168.com/includes/config.local.php
```

确认：

```php
$dbname = 'c168_com';
$dbuser = 'c168_com';
$dbpass = '...';
```

权限（Amazon Linux php-fpm 用户常为 `apache`）：

```bash
sudo chown ec2-user:apache /var/www/count168.com/includes/config.local.php
sudo chmod 640 /var/www/count168.com/includes/config.local.php
```

测连接：

```bash
mysql -u c168_com -p -h 127.0.0.1 c168_com -e "SELECT 1"
curl -sS -X POST https://count168.com/api/session/login_api.php \
  -F action=login -F company_id=TEST -F login_id=TEST -F password=x -F login_role=admin
```

应返回 JSON，而不是空白 HTTP 500。

---

## 四、HTTPS

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d count168.com -d www.count168.com
```

会生成 `count168.com-le-ssl.conf`。日常 `deploy.sh` **不会覆盖**该文件。

---

## 五、GitHub Actions（日常发版）

仓库 **kunzzgroups/count168** → Settings → Secrets and variables → Actions：

| Secret | 值 |
|--------|-----|
| `EC2_HOST` | EC2 公网 IP |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | `Server_Key.pem` 全文（含 BEGIN/END） |

本地（前端有改时）：

```bash
cd frontend && npm run build:deploy && cd ..
git add -A && git commit -m "说明"
git push origin main
```

Actions **Deploy to EC2** → job `count168.com` → 远端执行 `deploy/deploy.sh`（`git fetch` + `reset --hard origin/main` + reload nginx）。

手动救急：

```bash
sudo chown -R ec2-user:nginx /var/www/count168.com
bash /var/www/count168.com/deploy/deploy.sh
```

验证是否跟上 main：

```bash
curl -sS https://count168.com/frontend/dist/index.html | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1
```

---

## 五（附）、Transaction Payment SSE（可选）

见 `deploy/TX_REALTIME.md`。同机 **.site / .net 已跑 `tx-realtime`（3911）时，.com 先不要再起一份**，否则端口冲突。

---

## 六、与 .site 隔离检查清单

- [ ] 代码：`/var/www/count168.com` ≠ `/var/www/count168`
- [ ] Nginx：`count168.com.conf` / `count168.com-le-ssl.conf`，无 `default_server`
- [ ] DB：`c168_com`，`config.local.php` 未指向 `u857194726_c168site`
- [ ] Git remote：`origin` = `kunzzgroups/count168`
- [ ] Actions Secrets 已配在 **kunzzgroups/count168** 仓库（不是 test）

---

## 七、常见问题

**duplicate default_server**  
只留给 `.org`；对 `.com`：`sudo sed -i 's/ default_server//g' /etc/nginx/conf.d/count168.com.conf`

**登录 500**  
多半是 `config.local.php` 连错库或 php-fpm 读不到文件（权限组 `apache`）。

**Actions 红、网站仍旧**  
在 EC2 手动跑 `deploy.sh`；检查 Secrets 私钥是否完整；对比 live `index-*.js` hash。
