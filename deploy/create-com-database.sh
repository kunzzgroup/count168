#!/usr/bin/env bash
# 在 EC2 上创建 count168.com 专用 MariaDB 库与用户（与 .site 库隔离）
# 用法:
#   sudo bash deploy/create-com-database.sh
#   sudo COM_DB_PASS='强密码' bash deploy/create-com-database.sh
#
# 可选：从 .site 导出再导入（先设 IMPORT_FROM_SITE=1）
set -euo pipefail

DB_NAME="${COM_DB_NAME:-c168_com}"
DB_USER="${COM_DB_USER:-c168_com}"
DB_PASS="${COM_DB_PASS:-}"
SITE_DB="${SITE_DB_NAME:-u857194726_c168site}"
IMPORT_FROM_SITE="${IMPORT_FROM_SITE:-0}"

if [[ -z "$DB_PASS" ]]; then
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  GENERATED=1
else
  GENERATED=0
fi

echo "==> create database ${DB_NAME} + user ${DB_USER}"
mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

if [[ "$IMPORT_FROM_SITE" == "1" ]]; then
  echo "==> dump ${SITE_DB} → import into ${DB_NAME}"
  DUMP="/tmp/${SITE_DB}-to-${DB_NAME}.sql"
  mysqldump -u root --single-transaction --routines --triggers "$SITE_DB" > "$DUMP"
  mysql -u root "$DB_NAME" < "$DUMP"
  rm -f "$DUMP"
  echo "==> import done"
else
  echo "==> empty database ready（IMPORT_FROM_SITE=0）"
  echo "    若要复制 .site 数据: sudo IMPORT_FROM_SITE=1 COM_DB_PASS='...' bash deploy/create-com-database.sh"
fi

APP_ROOT="${APP_ROOT:-/var/www/count168.com}"
EXAMPLE="${APP_ROOT}/includes/config.local.php.example"
LOCAL_CFG="${APP_ROOT}/includes/config.local.php"

if [[ -f "$EXAMPLE" ]] && [[ ! -f "$LOCAL_CFG" ]]; then
  echo "==> write ${LOCAL_CFG}"
  sed -e "s/\\\$dbname = '.*';/\$dbname = '${DB_NAME}';/" \
      -e "s/\\\$dbuser = '.*';/\$dbuser = '${DB_USER}';/" \
      -e "s/\\\$dbpass = '.*';/\$dbpass = '${DB_PASS}';/" \
      "$EXAMPLE" > "$LOCAL_CFG"
  chown ec2-user:apache "$LOCAL_CFG" 2>/dev/null || chown ec2-user:nginx "$LOCAL_CFG" 2>/dev/null || true
  chmod 640 "$LOCAL_CFG"
fi

echo ""
echo "========================================"
echo "DB_NAME=${DB_NAME}"
echo "DB_USER=${DB_USER}"
if [[ "$GENERATED" == "1" ]]; then
  echo "DB_PASS=${DB_PASS}  (generated — save this)"
else
  echo "DB_PASS=(from COM_DB_PASS)"
fi
echo "config: ${LOCAL_CFG}"
echo "========================================"
