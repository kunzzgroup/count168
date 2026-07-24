#!/usr/bin/env bash
# EC2：部署 count168.com（本仓库主站）
set -euo pipefail

echo "========== count168.com (/var/www/count168.com) =========="
APP_ROOT=/var/www/count168.com bash /var/www/count168.com/deploy/deploy.sh

echo "========== all done =========="
