#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
SERVER_HOST="${SERVER_HOST:-8.130.169.220}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_DIR="${SERVER_DIR:-/opt/xueleai}"
DEFAULT_SSH_KEY="${ROOT_DIR}/xueleai.com.pem"
SSH_KEY="${SSH_KEY:-}"
DRY_RUN="${DRY_RUN:-0}"
release_started_at="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -z "${SSH_KEY}" && -f "${DEFAULT_SSH_KEY}" ]]; then
  SSH_KEY="${DEFAULT_SSH_KEY}"
fi

if [[ ! "${SERVER_HOST}" =~ ^[A-Za-z0-9.-]+$ ]] \
  || [[ ! "${SERVER_USER}" =~ ^[A-Za-z0-9._-]+$ ]] \
  || [[ ! "${SERVER_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "错误：服务器连接参数不合法。"
  exit 1
fi

if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "错误：版本号不合法：${VERSION}"
  exit 1
fi

release_sha="$(git rev-parse --verify HEAD)"
ssh_target="${SERVER_USER}@${SERVER_HOST}"
ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
release_lock_dir="${SERVER_DIR}.release.lock"
release_backup_dir="deploy/data/backups/releases/${release_started_at}-${VERSION}-${release_sha:0:12}"
release_lock_acquired=0
remote_deploy_started=0

if [[ -n "${SSH_KEY}" ]]; then
  ssh_options=(-i "${SSH_KEY}" "${ssh_options[@]}")
fi

echo "发布版本：${VERSION}"
echo "发布提交：${release_sha}"
echo "发布目标：${ssh_target}:${SERVER_DIR}"

acquire_release_lock() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[dry-run] acquire_release_lock %q %q\n' "${release_lock_dir}" "${release_sha}"
    return
  fi

  ssh "${ssh_options[@]}" "${ssh_target}" bash -s -- \
    "${SERVER_DIR}" \
    "${release_lock_dir}" \
    "${release_sha}" \
    "${VERSION}" \
    "${release_backup_dir}" \
    "${FORCE_RELEASE_UNLOCK:-0}" <<'REMOTE'
set -euo pipefail
server_dir="$1"
lock_dir="$2"
release_sha="$3"
version="$4"
backup_dir="$5"
force_unlock="$6"

if [[ -e "${lock_dir}" && "${force_unlock}" == "1" ]]; then
  rm -rf "${lock_dir}"
fi

if ! mkdir "${lock_dir}" 2>/dev/null; then
  echo "错误：另一个生产发布正在执行，锁目录为 ${lock_dir}。" >&2
  if [[ -f "${lock_dir}/owner" ]]; then
    sed -n '1,8p' "${lock_dir}/owner" >&2
  fi
  exit 1
fi

trap 'rm -rf "${lock_dir}"' ERR
chmod 700 "${lock_dir}"
printf '%s\n' \
  "release_sha=${release_sha}" \
  "version=${version}" \
  "started_at=$(date -Iseconds)" \
  > "${lock_dir}/owner"
chmod 600 "${lock_dir}/owner"

mkdir -p "${server_dir}/${backup_dir}"
chmod 700 "${server_dir}/${backup_dir}"

if [[ -f "${server_dir}/.env.production" ]]; then
  cp -p "${server_dir}/.env.production" "${server_dir}/${backup_dir}/.env.production.before-release"
fi

if [[ -f "${server_dir}/docker-compose.prod.yml" ]]; then
  cp -p "${server_dir}/docker-compose.prod.yml" "${server_dir}/${backup_dir}/docker-compose.prod.yml.before-release"
fi

if [[ -d "${server_dir}/deploy/nginx" ]]; then
  mkdir -p "${server_dir}/${backup_dir}/deploy-nginx.before-release"
  cp -a "${server_dir}/deploy/nginx/." "${server_dir}/${backup_dir}/deploy-nginx.before-release/"
fi

if [[ -f "${server_dir}/.release-source" ]]; then
  cp -p "${server_dir}/.release-source" "${server_dir}/${backup_dir}/.release-source.before-release"
else
  : > "${server_dir}/${backup_dir}/.release-source.was-absent"
fi
REMOTE

  release_lock_acquired=1
}

release_release_lock() {
  if [[ "${release_lock_acquired}" != "1" ]]; then
    return
  fi

  if ! ssh "${ssh_options[@]}" "${ssh_target}" bash -s -- \
    "${release_lock_dir}" "${release_sha}" <<'REMOTE'
set -euo pipefail
lock_dir="$1"
release_sha="$2"

if [[ ! -f "${lock_dir}/owner" ]] || ! grep -Fxq "release_sha=${release_sha}" "${lock_dir}/owner"; then
  echo "错误：发布锁归属不一致，拒绝删除 ${lock_dir}。" >&2
  exit 1
fi

rm -rf "${lock_dir}"
REMOTE
  then
    return 1
  fi
  release_lock_acquired=0
}

handle_release_exit() {
  local status="$?"
  trap - EXIT

  if (( status == 0 || remote_deploy_started == 0 )); then
    if ! release_release_lock; then
      echo "警告：服务器发布锁未能自动释放：${release_lock_dir}" >&2
    fi
  else
    echo "警告：远程部署状态不明确，保留服务器发布锁：${release_lock_dir}" >&2
    echo "确认远程进程已结束后，下一次发布可显式设置 FORCE_RELEASE_UNLOCK=1。" >&2
  fi

  exit "${status}"
}

trap handle_release_exit EXIT

echo "阶段 1/5：release:github-check"
TARGET_BRANCH="${TARGET_BRANCH}" VERSION="${VERSION}" pnpm release:github-check

echo "阶段 2/5：acquire_release_lock"
acquire_release_lock

echo "阶段 3/5：release:sync-server"
SERVER_HOST="${SERVER_HOST}" \
SERVER_USER="${SERVER_USER}" \
SERVER_DIR="${SERVER_DIR}" \
SSH_KEY="${SSH_KEY}" \
DRY_RUN="${DRY_RUN}" \
XUELEAI_RELEASE_ORCHESTRATED=1 \
scripts/release/sync-server.sh

echo "阶段 4/5：release:deploy"
if [[ "${DRY_RUN}" == "1" ]]; then
  printf '[dry-run] ssh'
  printf ' %q' "${ssh_options[@]}" "${ssh_target}"
  printf ' bash -s -- %q %q %q %q\n' \
    "${SERVER_DIR}" "${VERSION}" "${release_sha}" "${release_backup_dir}"
else
  remote_deploy_started=1
  ssh "${ssh_options[@]}" "${ssh_target}" bash -s -- \
    "${SERVER_DIR}" "${VERSION}" "${release_sha}" "${release_backup_dir}" <<'REMOTE'
set -euo pipefail
server_dir="$1"
version="$2"
release_sha="$3"
release_backup_dir="$4"
cd "${server_dir}"
XUELEAI_RELEASE_LOCK_HELD=1 \
RELEASE_SHA="${release_sha}" \
RELEASE_BACKUP_DIR="${release_backup_dir}" \
scripts/release/deploy.sh "${version}"
REMOTE
fi

echo "阶段 5/5：release:verify-live"
if [[ "${DRY_RUN}" == "1" ]]; then
  printf '[dry-run] EXPECTED_VERSION=%q EXPECTED_RELEASE_SHA=%q VERIFY_PAGE_PATH=%q pnpm release:verify-live\n' \
    "${VERSION}" "${release_sha}" "/media-tutor"
else
  EXPECTED_VERSION="${VERSION}" \
  EXPECTED_RELEASE_SHA="${release_sha}" \
  VERIFY_PAGE_PATH="/media-tutor" \
  pnpm release:verify-live

  ssh "${ssh_options[@]}" "${ssh_target}" bash -s -- "${SERVER_DIR}" "${VERSION}" "${release_sha}" <<'REMOTE'
set -euo pipefail
server_dir="$1"
version="$2"
release_sha="$3"
cd "${server_dir}"

source_sha="$(awk -F= '$1 == "RELEASE_COMMIT" { print $2 }' .release-source)"
test "${source_sha}" = "${release_sha}"

for service in web api-core ai-gateway; do
  container="xueleai-prod-${service}-1"
  actual_version="$(docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' | awk -F= '$1 == "APP_VERSION" { print substr($0, length($1) + 2) }')"
  actual_revision="$(docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' | awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, length($1) + 2) }')"
  test "${actual_version}" = "${version}"
  test "${actual_revision}" = "${release_sha}"
done
REMOTE
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "线上发布 dry-run 完成，未修改服务器。"
else
  echo "线上发布成功：${VERSION} (${release_sha})。"
fi
