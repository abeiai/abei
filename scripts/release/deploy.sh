#!/usr/bin/env bash
set -eEuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

VERSION="${1:-${VERSION:-}}"
RELEASE_SHA="${RELEASE_SHA:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
RELEASE_SOURCE_FILE="${RELEASE_SOURCE_FILE:-.release-source}"
RELEASE_LOCK_DIR="${RELEASE_LOCK_DIR:-${ROOT_DIR}.release.lock}"

if [[ "${XUELEAI_RELEASE_LOCK_HELD:-0}" != "1" && "${ALLOW_STANDALONE_DEPLOY:-0}" != "1" ]]; then
  echo "错误：生产部署只能由 pnpm release:server 在持有服务器锁时调用。"
  echo "紧急人工排障需显式设置 ALLOW_STANDALONE_DEPLOY=1。"
  exit 1
fi

if [[ -z "${VERSION}" ]]; then
  echo "用法：scripts/release/deploy.sh <version>"
  exit 1
fi

if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "错误：版本号不合法：${VERSION}"
  exit 1
fi

if [[ ! "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "错误：必须通过 RELEASE_SHA 指定 40 位小写 Git 提交。"
  exit 1
fi

if [[ "${ALLOW_STANDALONE_DEPLOY:-0}" != "1" ]]; then
  if [[ ! -f "${RELEASE_LOCK_DIR}/owner" ]] \
    || ! grep -Fxq "release_sha=${RELEASE_SHA}" "${RELEASE_LOCK_DIR}/owner"; then
    echo "错误：服务器发布锁不存在或不属于当前提交。"
    exit 1
  fi
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "错误：生产 Compose 文件不存在：${COMPOSE_FILE}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" && "${DRY_RUN:-0}" != "1" ]]; then
  echo "错误：生产环境变量文件不存在：${ENV_FILE}"
  echo "请先复制 .env.production.example 为 .env.production 并填入真实生产配置。"
  exit 1
fi

verify_release_source() {
  if [[ ! -f "${RELEASE_SOURCE_FILE}" ]]; then
    echo "错误：缺少服务器源码标识文件：${RELEASE_SOURCE_FILE}"
    exit 1
  fi

  local source_sha
  source_sha="$(awk -F= '$1 == "RELEASE_COMMIT" { print $2 }' "${RELEASE_SOURCE_FILE}")"

  if [[ ! "${source_sha}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "错误：服务器源码标识无效。"
    exit 1
  fi

  if [[ "${source_sha}" != "${RELEASE_SHA}" ]]; then
    echo "错误：服务器源码提交与待发布提交不一致。"
    echo "服务器源码：${source_sha}"
    echo "待发布提交：${RELEASE_SHA}"
    exit 1
  fi
}

verify_release_source

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未找到 docker。"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "错误：未找到 curl，无法执行公网发布验真。"
  exit 1
fi

set -a
# shellcheck disable=SC1090
if [[ -f "${ENV_FILE}" ]]; then
  source "${ENV_FILE}"
elif [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "警告：生产环境变量文件不存在：${ENV_FILE}。dry-run 将使用默认发布参数。"
else
  echo "错误：生产环境变量文件不存在：${ENV_FILE}"
  echo "请先复制 .env.production.example 为 .env.production 并填入真实生产配置。"
  exit 1
fi
set +a

IMAGE_REGISTRY="${IMAGE_REGISTRY-}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-xueleai}"
IMAGE_PROJECT="${IMAGE_PROJECT:-xueleai}"
RELEASE_TAG="${VERSION}-${RELEASE_SHA}"

if [[ -n "${IMAGE_REGISTRY}" ]]; then
  IMAGE_PREFIX="${IMAGE_REGISTRY%/}/${IMAGE_NAMESPACE}/${IMAGE_PROJECT}"
  WEB_IMAGE="${IMAGE_PREFIX}:web-${RELEASE_TAG}"
  API_CORE_IMAGE="${IMAGE_PREFIX}:api-core-${RELEASE_TAG}"
  AI_GATEWAY_IMAGE="${IMAGE_PREFIX}:ai-gateway-${RELEASE_TAG}"
  IMAGE_MODE="registry"
else
  WEB_IMAGE="xueleai-web:${RELEASE_TAG}"
  API_CORE_IMAGE="xueleai-api-core:${RELEASE_TAG}"
  AI_GATEWAY_IMAGE="xueleai-ai-gateway:${RELEASE_TAG}"
  IMAGE_MODE="local-build"
fi

RELEASE_BACKUP_DIR="${RELEASE_BACKUP_DIR:-deploy/data/backups/releases/$(date -u +%Y%m%dT%H%M%SZ)-${VERSION}-${RELEASE_SHA:0:12}}"
PREVIOUS_ENV_FILE="${RELEASE_BACKUP_DIR}/.env.production.before-release"
PREVIOUS_COMPOSE_FILE="${RELEASE_BACKUP_DIR}/docker-compose.prod.yml.before-release"
PREVIOUS_NGINX_DIR="${RELEASE_BACKUP_DIR}/deploy-nginx.before-release"
PREVIOUS_SOURCE_FILE="${RELEASE_BACKUP_DIR}/.release-source.before-release"
PREVIOUS_SOURCE_ABSENT_FILE="${RELEASE_BACKUP_DIR}/.release-source.was-absent"
CANDIDATE_ENV_FILE="${RELEASE_BACKUP_DIR}/.env.production.candidate"
maintenance_started=0
release_succeeded=0
pending_migration_count=0
migration_started=0

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

compose() {
  WEB_IMAGE="${WEB_IMAGE}" \
  API_CORE_IMAGE="${API_CORE_IMAGE}" \
  AI_GATEWAY_IMAGE="${AI_GATEWAY_IMAGE}" \
  APP_VERSION="${VERSION}" \
  APP_RELEASE_SHA="${RELEASE_SHA}" \
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

compose_previous() {
  env \
    -u WEB_IMAGE \
    -u API_CORE_IMAGE \
    -u AI_GATEWAY_IMAGE \
    -u APP_VERSION \
    -u APP_RELEASE_SHA \
    docker compose \
    --project-directory "${ROOT_DIR}" \
    --env-file "${PREVIOUS_ENV_FILE}" \
    -f "${PREVIOUS_COMPOSE_FILE}" \
    "$@"
}

detect_pending_migrations() {
  local postgres_container
  local applied_migrations
  local migration_dir
  local migration_name

  postgres_container="$(compose ps -q postgres)"
  applied_migrations="$(docker exec "${postgres_container}" sh -lc \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -p 3327 -Atc "SELECT migration_name FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"')"

  pending_migration_count=0
  for migration_dir in packages/database/prisma/migrations/*/; do
    [[ -d "${migration_dir}" ]] || continue
    migration_name="$(basename "${migration_dir}")"
    if ! grep -Fxq "${migration_name}" <<< "${applied_migrations}"; then
      pending_migration_count="$((pending_migration_count + 1))"
      echo "待执行 migration：${migration_name}"
    fi
  done

  echo "待执行 migration 数量：${pending_migration_count}"
}

ensure_release_capacity() {
  local minimum_free_mb="${MIN_RELEASE_FREE_MB:-8192}"
  local available_kb
  local available_mb

  if [[ ! "${minimum_free_mb}" =~ ^[0-9]+$ ]] || (( minimum_free_mb < 1024 )); then
    echo "错误：MIN_RELEASE_FREE_MB 必须是至少 1024 的整数。"
    exit 1
  fi

  available_kb="$(df -Pk "${ROOT_DIR}" | awk 'NR == 2 { print $4 }')"
  available_mb="$((available_kb / 1024))"
  echo "发布前可用磁盘空间：${available_mb} MB，要求至少 ${minimum_free_mb} MB。"

  if (( available_mb < minimum_free_mb )); then
    if [[ "${ALLOW_BUILD_CACHE_PRUNE:-1}" != "1" ]]; then
      echo "错误：可用磁盘空间不足，且未允许清理 Docker 构建缓存。"
      exit 1
    fi

    echo "可用空间不足，清理未使用的 Docker 构建缓存。"
    docker builder prune --all --force
    available_kb="$(df -Pk "${ROOT_DIR}" | awk 'NR == 2 { print $4 }')"
    available_mb="$((available_kb / 1024))"
    echo "清理后可用磁盘空间：${available_mb} MB。"
  fi

  if (( available_mb < minimum_free_mb )); then
    echo "错误：清理构建缓存后磁盘空间仍不足，停止发布。"
    exit 1
  fi
}

container_env_value() {
  local container_id="$1"
  local key="$2"

  docker inspect "${container_id}" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -F= -v key="${key}" '$1 == key { print substr($0, length(key) + 2) }'
}

verify_service_identity() {
  local service="$1"
  local expected_image="$2"
  local container_id
  local actual_image
  local actual_image_id
  local expected_image_id
  local actual_version
  local actual_revision
  local image_version
  local image_revision

  container_id="$(compose ps -q "${service}")"

  if [[ -z "${container_id}" ]]; then
    echo "错误：服务没有运行容器：${service}"
    exit 1
  fi

  actual_image="$(docker inspect "${container_id}" --format '{{.Config.Image}}')"
  actual_image_id="$(docker inspect "${container_id}" --format '{{.Image}}')"
  expected_image_id="$(docker image inspect "${expected_image}" --format '{{.Id}}')"
  actual_version="$(container_env_value "${container_id}" APP_VERSION)"
  actual_revision="$(container_env_value "${container_id}" APP_RELEASE_SHA)"
  image_version="$(docker image inspect "${actual_image_id}" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')"
  image_revision="$(docker image inspect "${actual_image_id}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"

  if [[ "${actual_image}" != "${expected_image}" ]]; then
    echo "错误：${service} 运行镜像不一致：${actual_image}"
    exit 1
  fi

  if [[ "${actual_image_id}" != "${expected_image_id}" ]]; then
    echo "错误：${service} 运行镜像 ID 与目标镜像不一致。"
    exit 1
  fi

  if [[ "${actual_version}" != "${VERSION}" || "${image_version}" != "${VERSION}" ]]; then
    echo "错误：${service} 运行版本不一致。"
    exit 1
  fi

  if [[ "${actual_revision}" != "${RELEASE_SHA}" || "${image_revision}" != "${RELEASE_SHA}" ]]; then
    echo "错误：${service} 运行提交不一致。"
    exit 1
  fi
}

verify_running_release() {
  local api_container
  local web_container

  verify_service_identity web "${WEB_IMAGE}"
  verify_service_identity api-core "${API_CORE_IMAGE}"
  verify_service_identity ai-gateway "${AI_GATEWAY_IMAGE}"

  api_container="$(compose ps -q api-core)"
  docker exec "${api_container}" node -e '
    const [version, revision] = process.argv.slice(1);
    fetch("http://127.0.0.1:3322/api/health")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.code !== 0 || payload?.data?.version !== version || payload?.data?.revision !== revision) {
          process.exit(1);
        }
      })
      .catch(() => process.exit(1));
  ' "${VERSION}" "${RELEASE_SHA}"

  web_container="$(compose ps -q web)"
  docker exec "${web_container}" node -e '
    const [version, revision] = process.argv.slice(1);
    fetch("http://127.0.0.1:3321/")
      .then((response) => response.text())
      .then((html) => {
        if (!html.includes(`data-app-version="${version}"`) || !html.includes(`data-release="${revision}"`)) {
          process.exit(1);
        }
      })
      .catch(() => process.exit(1));
  ' "${VERSION}" "${RELEASE_SHA}"
}

verify_public_release() {
  local base_url="${LIVE_BASE_URL:-https://xueleai.com}"
  local health_payload
  local public_config_payload
  local page_html

  base_url="${base_url%/}"
  health_payload="$(curl --fail --silent --show-error \
    --retry 5 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 \
    "${base_url}/api/health")"
  public_config_payload="$(curl --fail --silent --show-error \
    --retry 5 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 \
    "${base_url}/api/system-config/public")"
  page_html="$(curl --fail --silent --show-error --location \
    --retry 5 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 \
    -H 'Cache-Control: no-cache' \
    "${base_url}/media-tutor?release=${RELEASE_SHA}")"

  if ! grep -Eq "\"version\"[[:space:]]*:[[:space:]]*\"${VERSION}\"" <<< "${health_payload}" \
    || ! grep -Eq "\"revision\"[[:space:]]*:[[:space:]]*\"${RELEASE_SHA}\"" <<< "${health_payload}"; then
    echo "错误：公网 API 返回的版本或提交不一致。"
    exit 1
  fi

  if ! grep -Eq '"code"[[:space:]]*:[[:space:]]*0' <<< "${public_config_payload}"; then
    echo "错误：公网系统配置接口未返回成功状态。"
    exit 1
  fi

  if ! grep -Fq "data-app-version=\"${VERSION}\"" <<< "${page_html}" \
    || ! grep -Fq "data-release=\"${RELEASE_SHA}\"" <<< "${page_html}"; then
    echo "错误：公网媒体导学页面未返回当前发布身份。"
    exit 1
  fi
}

prepare_release_backup() {
  local postgres_container
  local dump_file
  local restore_list_file

  mkdir -p "${RELEASE_BACKUP_DIR}"
  chmod 700 "${RELEASE_BACKUP_DIR}"

  if [[ ! -f "${PREVIOUS_ENV_FILE}" ]]; then
    cp -p "${ENV_FILE}" "${PREVIOUS_ENV_FILE}"
  fi

  if [[ ! -f "${PREVIOUS_COMPOSE_FILE}" ]]; then
    cp -p "${COMPOSE_FILE}" "${PREVIOUS_COMPOSE_FILE}"
  fi

  chmod 600 "${PREVIOUS_ENV_FILE}" "${PREVIOUS_COMPOSE_FILE}"
  cp -p "${PREVIOUS_ENV_FILE}" "${CANDIDATE_ENV_FILE}"
  scripts/release/update-release-env.sh \
    "${CANDIDATE_ENV_FILE}" \
    "${VERSION}" \
    "${RELEASE_SHA}" \
    "${WEB_IMAGE}" \
    "${API_CORE_IMAGE}" \
    "${AI_GATEWAY_IMAGE}"
  chmod 600 "${CANDIDATE_ENV_FILE}"

  env \
    -u WEB_IMAGE \
    -u API_CORE_IMAGE \
    -u AI_GATEWAY_IMAGE \
    -u APP_VERSION \
    -u APP_RELEASE_SHA \
    docker compose \
    --project-directory "${ROOT_DIR}" \
    --env-file "${CANDIDATE_ENV_FILE}" \
    -f "${COMPOSE_FILE}" \
    config --quiet

  postgres_container="$(compose ps -q postgres)"

  if [[ -z "${postgres_container}" ]]; then
    echo "错误：无法定位 PostgreSQL 容器，未执行 migration。"
    exit 1
  fi

  dump_file="${RELEASE_BACKUP_DIR}/postgres-before-migration.dump"
  restore_list_file="${RELEASE_BACKUP_DIR}/postgres-before-migration.list"
  docker exec "${postgres_container}" sh -lc \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -p 3327 -Fc --no-owner --no-acl' \
    > "${dump_file}"
  chmod 600 "${dump_file}"

  if [[ ! -s "${dump_file}" ]]; then
    echo "错误：migration 前数据库备份为空，已停止发布。"
    exit 1
  fi

  docker exec -i "${postgres_container}" pg_restore --list \
    < "${dump_file}" \
    > "${restore_list_file}"
  chmod 600 "${restore_list_file}"

  if [[ ! -s "${restore_list_file}" ]]; then
    echo "错误：数据库备份无法通过 pg_restore 清单校验，已停止发布。"
    exit 1
  fi

  (
    cd "${RELEASE_BACKUP_DIR}"
    sha256sum postgres-before-migration.dump postgres-before-migration.list > SHA256SUMS
    chmod 600 SHA256SUMS
  )
  echo "migration 前数据库备份已完成：${dump_file}"
}

persist_release_state() {
  local env_dir
  local env_name
  local pending_env

  env_dir="$(cd "$(dirname "${ENV_FILE}")" && pwd)"
  env_name="$(basename "${ENV_FILE}")"
  pending_env="$(mktemp "${env_dir}/.${env_name}.pending.XXXXXX")"
  cp -p "${CANDIDATE_ENV_FILE}" "${pending_env}"
  mv -f "${pending_env}" "${ENV_FILE}"

  printf '%s\n' \
    "version=${VERSION}" \
    "release_sha=${RELEASE_SHA}" \
    "web_image=${WEB_IMAGE}" \
    "api_core_image=${API_CORE_IMAGE}" \
    "ai_gateway_image=${AI_GATEWAY_IMAGE}" \
    "completed_at=$(date -Iseconds)" \
    > "${RELEASE_BACKUP_DIR}/release-metadata.txt"

  echo "发布状态已持久化，备份目录：${RELEASE_BACKUP_DIR}"
}

rollback_running_release() {
  local rollback_env

  echo "发布未完成，开始恢复上一组应用容器和生产发布配置。"

  if [[ ! -f "${PREVIOUS_ENV_FILE}" || ! -f "${PREVIOUS_COMPOSE_FILE}" ]]; then
    echo "错误：缺少上一版本的环境或 Compose 快照，无法自动恢复应用容器。" >&2
    return 1
  fi

  rollback_env="$(mktemp "$(dirname "${ENV_FILE}")/.env.production.rollback.XXXXXX")"
  cp -p "${PREVIOUS_ENV_FILE}" "${rollback_env}" || return 1
  mv -f "${rollback_env}" "${ENV_FILE}" || return 1

  cp -p "${PREVIOUS_COMPOSE_FILE}" "${COMPOSE_FILE}" || return 1

  if [[ -d "${PREVIOUS_NGINX_DIR}" ]]; then
    mkdir -p deploy/nginx || return 1
    rsync -a --delete "${PREVIOUS_NGINX_DIR}/" deploy/nginx/ || return 1
  fi

  if [[ -f "${PREVIOUS_SOURCE_FILE}" ]]; then
    cp -p "${PREVIOUS_SOURCE_FILE}" "${RELEASE_SOURCE_FILE}" || return 1
  elif [[ -f "${PREVIOUS_SOURCE_ABSENT_FILE}" ]]; then
    rm -f "${RELEASE_SOURCE_FILE}" || return 1
  fi

  if (( migration_started == 1 && pending_migration_count > 0 )) \
    && [[ "${ALLOW_AUTOMATIC_APP_ROLLBACK_AFTER_MIGRATION:-0}" != "1" ]]; then
    compose stop nginx web api-core ai-gateway || true
    printf '%s\n' \
      "failed_version=${VERSION}" \
      "failed_release_sha=${RELEASE_SHA}" \
      "pending_migrations=${pending_migration_count}" \
      "action=restore_database_or_confirm_backward_compatibility_before_reopening" \
      "maintenance_started_at=$(date -Iseconds)" \
      > "${RELEASE_BACKUP_DIR}/manual-database-recovery-required.txt"
    chmod 600 "${RELEASE_BACKUP_DIR}/manual-database-recovery-required.txt"
    echo "migration 后发布失败，已保持维护状态；确认数据库兼容性或恢复备份后再开放服务。" >&2
    return 0
  fi

  compose_previous up -d --remove-orphans --wait \
    --wait-timeout "${DEPLOY_WAIT_TIMEOUT_SECONDS:-300}" \
    nginx web api-core ai-gateway postgres redis || return 1

  printf '%s\n' \
    "failed_version=${VERSION}" \
    "failed_release_sha=${RELEASE_SHA}" \
    "rolled_back_at=$(date -Iseconds)" \
    > "${RELEASE_BACKUP_DIR}/release-failed.txt"
  chmod 600 "${RELEASE_BACKUP_DIR}/release-failed.txt"
  echo "上一组应用容器和生产发布配置已恢复。"
}

handle_release_exit() {
  local status="$?"
  trap - EXIT

  if (( status != 0 && maintenance_started == 1 && release_succeeded == 0 )); then
    if ! rollback_running_release; then
      echo "错误：自动恢复上一版本失败，请立即人工处理：${RELEASE_BACKUP_DIR}" >&2
    fi
  fi

  exit "${status}"
}

trap handle_release_exit EXIT

echo "部署版本：${VERSION}"
echo "发布提交：${RELEASE_SHA}"
echo "Compose 文件：${COMPOSE_FILE}"
echo "环境变量文件：${ENV_FILE}"
echo "镜像模式：${IMAGE_MODE}"
echo "镜像标签："
echo "  web:        ${WEB_IMAGE}"
echo "  api-core:   ${API_CORE_IMAGE}"
echo "  ai-gateway: ${AI_GATEWAY_IMAGE}"

run ensure_release_capacity
run mkdir -p deploy/data/logs/api-core deploy/data/logs/nginx deploy/data/uploads
run chown -R 1000:1000 deploy/data/logs/api-core deploy/data/uploads
run chmod -R u+rwX,g+rwX deploy/data/logs/api-core deploy/data/uploads
run compose run --rm runtime-permissions

if [[ "${IMAGE_MODE}" == "registry" ]]; then
  run compose pull web api-core ai-gateway
else
  run compose build web api-core ai-gateway
fi

run compose up -d --wait --wait-timeout "${DEPLOY_WAIT_TIMEOUT_SECONDS:-300}" postgres redis
run detect_pending_migrations
maintenance_started=1
run compose stop nginx web api-core ai-gateway
run prepare_release_backup
migration_started=1
run compose run --rm api-core pnpm db:migrate:deploy

if [[ "${RUN_SEED:-0}" == "1" ]]; then
  run compose run --rm api-core pnpm db:seed
fi

run compose up -d --remove-orphans --wait --wait-timeout "${DEPLOY_WAIT_TIMEOUT_SECONDS:-300}" web api-core ai-gateway postgres redis
run verify_running_release
run compose up -d --wait --wait-timeout "${DEPLOY_WAIT_TIMEOUT_SECONDS:-300}" nginx
run verify_public_release
run persist_release_state
run compose ps
run compose run --rm api-core node apps/api-core/dist/ai/sync-built-in-scenarios.js
release_succeeded=1

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "部署 dry-run 完成，未修改服务或生产配置。"
else
  echo "部署流程完成：${VERSION} (${RELEASE_SHA})。"
fi
