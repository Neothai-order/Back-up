#!/bin/bash
# Firebase Hosting 배포 + GitHub 백업 자동화
# 사용: bash deploy.sh
#
# 동작:
#   1. firebase deploy --only hosting
#   2. Git 변경사항이 있으면 add -A → commit → push (현재 브랜치)
#   3. 배포 실패 시 git 백업은 진행하지 않음 (set -e)

set -e

echo "[1/2] Firebase Hosting deploy..."
firebase deploy --only hosting

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ -n $(git status --porcelain) ]]; then
  echo "[2/2] Git backup to origin/${BRANCH}..."
  git add -A
  git commit -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
  git push origin "$BRANCH"
  echo "Done: deploy + backup complete"
else
  echo "Done: deploy complete (no git changes to back up)"
fi
