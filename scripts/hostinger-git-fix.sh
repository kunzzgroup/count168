#!/usr/bin/env sh
# Fix Hostinger error: "fatal: Need to specify how to reconcile divergent branches."
#
# Usage (SSH into Hostinger, then):
#   1) cd to the SAME folder where GIT deploys (often ~/domains/YOURDOMAIN/public_html
#      or ~/git/count168test — check hPanel → GIT → repository path).
#   2) sh scripts/hostinger-git-fix.sh
#      OR from repo root only:
#   git config pull.rebase false
#   git config pull.ff false
#   git fetch origin && git reset --hard origin/main
#
# "reset --hard" discards ONLY commits that exist only on the server and makes the
# server match GitHub exactly (recommended for deploy targets).

set -e

BRANCH="${GIT_BRANCH:-main}"

echo "Configuring pull behaviour for this repo..."
git config pull.rebase false
git config pull.ff false

echo "Fetching origin and aligning working tree to origin/${BRANCH}..."
git fetch origin
git reset --hard "origin/${BRANCH}"

echo "Done. Repository matches GitHub ${BRANCH}. Run Deploy again from hPanel if needed."
