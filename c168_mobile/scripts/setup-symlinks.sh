#!/usr/bin/env bash
# EC2 / Linux：在 c168_mobile 目录联接父级 api / includes / images
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(dirname "$ROOT")"

for name in api includes images; do
  link="${ROOT}/${name}"
  target="${PARENT}/${name}"
  if [[ ! -d "$target" ]]; then
    echo "ERROR: missing ${target}"
    exit 1
  fi
  if [[ -e "$link" ]]; then
    echo "skip (exists): ${name}"
    continue
  fi
  ln -s "../${name}" "$link"
  echo "linked: ${name} -> ../${name}"
done

echo "Done. DB config: ${PARENT}/includes/config.local.php"
