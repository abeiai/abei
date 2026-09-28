#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ "${XUELEAI_RELEASE_ORCHESTRATED:-0}" != "1" && "${ALLOW_STANDALONE_SYNC:-0}" != "1" ]]; then
  echo "错误：服务器源码同步只能由 pnpm release:server 调用。"
  echo "紧急人工排障需显式设置 ALLOW_STANDALONE_SYNC=1。"
  exit 1
fi

SERVER_HOST="${SERVER_HOST:-xueleai.com}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_DIR="${SERVER_DIR:-/opt/xueleai}"
DEFAULT_SSH_KEY="${ROOT_DIR}/xueleai.com.pem"
SSH_KEY="${SSH_KEY:-}"

if [[ -z "${SSH_KEY}" && -f "${DEFAULT_SSH_KEY}" ]]; then
  SSH_KEY="${DEFAULT_SSH_KEY}"
fi

if [[ ! "${SERVER_HOST}" =~ ^[A-Za-z0-9.-]+$ ]] \
  || [[ ! "${SERVER_USER}" =~ ^[A-Za-z0-9._-]+$ ]] \
  || [[ ! "${SERVER_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "错误：服务器连接参数不合法。"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "错误：未找到 rsync。"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "错误：未找到 git。"
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "错误：未找到 tar。"
  exit 1
fi

if [[ "${ALLOW_DIRTY_RELEASE:-0}" != "1" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "错误：工作区存在未提交变更。请先提交并通过 GitHub 发布检查后再同步服务器。"
    echo "如需仅测试脚本行为，可临时设置 ALLOW_DIRTY_RELEASE=1。"
    exit 1
  fi
fi

release_commit="$(git rev-parse --verify HEAD)"
release_dir="$(mktemp -d)"

cleanup() {
  rm -rf "${release_dir}"
}

trap cleanup EXIT

git archive --format=tar "${release_commit}" | tar -x -C "${release_dir}"
printf 'RELEASE_COMMIT=%s\n' "${release_commit}" > "${release_dir}/.release-source"

ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)

if [[ -n "${SSH_KEY}" ]]; then
  ssh_options=(-i "${SSH_KEY}" "${ssh_options[@]}")
fi

ssh_target="${SERVER_USER}@${SERVER_HOST}"
rsync_ssh="ssh"

if [[ -n "${SSH_KEY}" ]]; then
  printf -v quoted_ssh_key '%q' "${SSH_KEY}"
  rsync_ssh="${rsync_ssh} -i ${quoted_ssh_key}"
fi

rsync_ssh="${rsync_ssh} -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

excludes=(
  --exclude=".env*"
  --exclude=".git/"
  --exclude=".superpowers/"
  --exclude="design-demos/"
  --exclude="data/"
  --exclude="node_modules/"
  --exclude="**/node_modules/"
  --exclude=".next/"
  --exclude="**/.next/"
  --exclude="dist/"
  --exclude="**/dist/"
  --exclude="build/"
  --exclude="**/build/"
  --exclude="out/"
  --exclude="**/out/"
  --exclude="coverage/"
  --exclude="**/coverage/"
  --exclude=".turbo/"
  --exclude="**/.turbo/"
  --exclude="packages/database/generated/"
  --exclude="apps/web/public/vendor/"
  --exclude="apps/web/public/vendor/vditor/"
  --exclude="apps/api-core/uploads/"
  --exclude="uploads/"
  --exclude=".pnpm-store/"
  --exclude=".uv-cache/"
  --exclude=".model-cache/"
  --exclude=".venv-textbook-md/"
  --exclude="/textbook/"
  --exclude="/textbook-markdown-assets/"
  --exclude="tmp/"
  --exclude="backups/"
  --exclude="deploy/data/"
  --exclude="deploy/certs/"
  --exclude="*.pem"
  --exclude="*.dump"
  --exclude="*.backup"
  --exclude="*.sql.gz"
  --exclude="*.log"
  --exclude="logs/"
  --exclude="screenlog.0"
  --exclude=".DS_Store"
  --exclude=".playwright-mcp/"
  --exclude="**/__pycache__/"
  --exclude="**/*.pyc"
)

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

prepare_remote_dir() {
  ssh "${ssh_options[@]}" "${ssh_target}" bash -s -- "${SERVER_DIR}" <<'REMOTE'
set -euo pipefail
server_dir="$1"
mkdir -p "${server_dir}" "${server_dir}/deploy/data" "${server_dir}/deploy/certs"
REMOTE
}

echo "同步目标：${ssh_target}:${SERVER_DIR}"
echo "同步模式：$([[ "${DRY_RUN:-0}" == "1" ]] && echo "dry-run" || echo "apply")"
echo "同步来源：Git HEAD ${release_commit}"

run prepare_remote_dir

rsync_args=(-az --delete)

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  rsync_args+=(--dry-run --itemize-changes)
fi

run rsync "${rsync_args[@]}" -e "${rsync_ssh}" "${excludes[@]}" "${release_dir}/" "${ssh_target}:${SERVER_DIR}/"

echo "服务器代码同步流程完成。"
