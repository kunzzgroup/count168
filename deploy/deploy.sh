#!/usr/bin/env bash
# EC2 上执行：拉取 main 并生效（由 GitHub Actions SSH 调用，或手动运行）
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168}"
BRANCH="${BRANCH:-main}"

cd "$APP_ROOT"

echo "==> git fetch + reset to origin/${BRANCH}"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

if command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$APP_ROOT" 2>/dev/null || true
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  sudo systemctl reload nginx || true
fi

echo "==> Deploy OK at $(date -Iseconds)"
