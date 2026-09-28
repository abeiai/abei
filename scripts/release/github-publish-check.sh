#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

TARGET_BRANCH="${TARGET_BRANCH:-main}"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
HEAD_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote origin "refs/heads/${TARGET_BRANCH}" | awk '{print $1}')"

echo "发布版本：${VERSION}"
echo "当前提交：${HEAD_SHA}"
echo "远端 ${TARGET_BRANCH}：${REMOTE_SHA:-未找到}"

if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY:-0}" != "1" ]]; then
  echo "错误：工作区存在未提交改动。请先提交发布内容，或设置 ALLOW_DIRTY=1 仅用于人工排查。"
  exit 1
fi

if [[ -z "${REMOTE_SHA}" ]]; then
  echo "错误：远端分支不存在：${TARGET_BRANCH}"
  exit 1
fi

if [[ "${HEAD_SHA}" != "${REMOTE_SHA}" ]]; then
  echo "错误：当前提交尚未发布到 origin/${TARGET_BRANCH}。"
  echo "请先推送并确认 GitHub 远端指针后，再执行线上服务器发布。"
  exit 1
fi

echo "GitHub 发布检查通过。"
