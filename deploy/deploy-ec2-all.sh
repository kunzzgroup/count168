#!/usr/bin/env bash
# EC2：部署 count168.net（本仓库主站）
set -euo pipefail

echo "========== count168.net (/var/www/count168.net) =========="
APP_ROOT=/var/www/count168.net bash /var/www/count168.net/deploy/deploy.sh

echo "========== all done =========="
