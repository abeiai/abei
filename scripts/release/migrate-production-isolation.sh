#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
BACKUP_ROOT="${BACKUP_ROOT:-${ROOT_DIR}/deploy/data/backups/production-isolation}"
LOCK_FILE="${LOCK_FILE:-/var/lock/xueleai-production-isolation.lock}"
RUNTIME_DIR="${RUNTIME_DIR:-/run}"

SOURCE_PROJECT="xueleai"
SOURCE_POSTGRES_VOLUME="xueleai_postgres_data"
SOURCE_REDIS_VOLUME="xueleai_redis_data"
SOURCE_POSTGRES_USER="aisaas"
SOURCE_POSTGRES_DB="aisaas"

TARGET_PROJECT="xueleai-prod"
TARGET_POSTGRES_VOLUME="xueleai-prod_postgres_data"
TARGET_REDIS_VOLUME="xueleai-prod_redis_data"
TARGET_POSTGRES_USER="xueleai"
TARGET_POSTGRES_DB="xueleai"

KEEP_OLD_ROLLBACK_ASSETS=1
MODE=""
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR=""
ENV_BACKUP=""
RUNTIME_POSTGRES_ENV=""
TARGET_POSTGRES_CONTAINER=""
WRITES_PAUSED=0
ENV_SWITCHED=0
MIGRATION_COMPLETE=0
ROLLBACK_IN_PROGRESS=0

usage() {
  cat <<'EOF'
Usage:
  scripts/release/migrate-production-isolation.sh --dry-run
  scripts/release/migrate-production-isolation.sh --execute
  scripts/release/migrate-production-isolation.sh --help

Modes:
  --dry-run  Run read-only production preflight checks and print the migration plan.
  --execute  Back up, migrate, verify, and switch the production data environment.

The migration keeps the old Compose project and old Docker volumes as rollback
assets. It never removes production data volumes.
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  if [[ "${WRITES_PAUSED}" -eq 1 &&
    "${MIGRATION_COMPLETE}" -eq 0 &&
    "${ROLLBACK_IN_PROGRESS}" -eq 0 ]]; then
    rollback_environment 1
  fi
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

compose_with_env() {
  local env_file="$1"
  local project="$2"
  shift 2
  local -a clean_environment=(
    env
    -i
    "PATH=${PATH}"
    "HOME=${HOME:-/root}"
  )
  local docker_variable

  for docker_variable in DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG DOCKER_CERT_PATH DOCKER_TLS_VERIFY; do
    if [[ -n "${!docker_variable:-}" ]]; then
      clean_environment+=("${docker_variable}=${!docker_variable}")
    fi
  done

  "${clean_environment[@]}" docker compose \
    --env-file "${env_file}" \
    -f "${COMPOSE_FILE}" \
    -p "${project}" \
    "$@"
}

source_compose() {
  compose_with_env "${ENV_FILE}" "${SOURCE_PROJECT}" "$@"
}

target_compose() {
  compose_with_env "${ENV_FILE}" "${TARGET_PROJECT}" "$@"
}

service_container() {
  local env_file="$1"
  local project="$2"
  local service="$3"
  compose_with_env "${env_file}" "${project}" ps -q "${service}"
}

container_health() {
  local container_id="$1"
  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "${container_id}"
}

read_env_value() {
  local env_file="$1"
  local key="$2"
  local matching_lines
  local count
  local value

  matching_lines="$(
    awk -v key="${key}" '
      index($0, key "=") == 1 {
        print substr($0, length(key) + 2)
      }
    ' "${env_file}"
  )"
  count="$(
    awk -v key="${key}" '
      index($0, key "=") == 1 { count += 1 }
      END { print count + 0 }
    ' "${env_file}"
  )"
  if [[ "${count}" -ne 1 ]]; then
    die "Expected exactly one ${key} entry in ${env_file}."
    return 1
  fi

  value="${matching_lines%$'\r'}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "${value}"
}

container_env_value() {
  local container_id="$1"
  local key="$2"
  local value

  value="$(
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${container_id}" |
      awk -v prefix="${key}=" '
        index($0, prefix) == 1 {
          print substr($0, length(prefix) + 1)
          found += 1
        }
        END {
          if (found != 1) {
            exit 1
          }
        }
      '
  )" || {
    die "Unable to read ${key} from the source PostgreSQL container."
    return 1
  }

  printf '%s' "${value}"
}

wait_for_container_health() {
  local container_id="$1"
  local label="$2"
  local attempts="${3:-60}"
  local status=""

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    status="$(container_health "${container_id}" 2>/dev/null || true)"
    if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
      return 0
    fi
    if [[ "${status}" == "unhealthy" || "${status}" == "exited" || "${status}" == "dead" ]]; then
      die "${label} entered terminal state: ${status}"
      return 1
    fi
    sleep 2
  done

  die "Timed out waiting for ${label}; last state: ${status:-unknown}"
  return 1
}

wait_for_project_service() {
  local env_file="$1"
  local project="$2"
  local service="$3"
  local container_id=""

  for _ in {1..30}; do
    container_id="$(service_container "${env_file}" "${project}" "${service}")"
    [[ -n "${container_id}" ]] && break
    sleep 2
  done

  if [[ -z "${container_id}" ]]; then
    die "No container found for ${project}/${service}"
    return 1
  fi
  wait_for_container_health "${container_id}" "${project}/${service}" 60
}

container_mounts_volume() {
  local container_id="$1"
  local expected_volume="$2"
  local expected_destination="$3"
  local mounts

  mounts="$(
    docker inspect \
      --format '{{range .Mounts}}{{printf "%s|%s\n" .Name .Destination}}{{end}}' \
      "${container_id}"
  )" || return 1
  printf '%s\n' "${mounts}" |
    grep -Fqx "${expected_volume}|${expected_destination}"
}

is_target_already_active() {
  [[ "${COMPOSE_PROJECT_NAME:-}" == "${TARGET_PROJECT}" ]] || return 1
  [[ "${POSTGRES_VOLUME_NAME:-}" == "${TARGET_POSTGRES_VOLUME}" ]] || return 1
  [[ "${REDIS_VOLUME_NAME:-}" == "${TARGET_REDIS_VOLUME}" ]] || return 1
  [[ "${POSTGRES_USER:-}" == "${TARGET_POSTGRES_USER}" ]] || return 1
  [[ "${POSTGRES_DB:-}" == "${TARGET_POSTGRES_DB}" ]] || return 1
  docker volume inspect "${TARGET_POSTGRES_VOLUME}" >/dev/null 2>&1 || return 1
  docker volume inspect "${TARGET_REDIS_VOLUME}" >/dev/null 2>&1 || return 1

  local service
  local container_id
  local status
  local postgres_container=""
  local redis_container=""
  local identity
  for service in postgres redis api-core ai-gateway web nginx; do
    container_id="$(service_container "${ENV_FILE}" "${TARGET_PROJECT}" "${service}")"
    [[ -n "${container_id}" ]] || return 1
    status="$(container_health "${container_id}" 2>/dev/null || true)"
    [[ "${status}" == "healthy" || "${status}" == "running" ]] || return 1
    [[ "${service}" == "postgres" ]] && postgres_container="${container_id}"
    [[ "${service}" == "redis" ]] && redis_container="${container_id}"
  done

  container_mounts_volume \
    "${postgres_container}" \
    "${TARGET_POSTGRES_VOLUME}" \
    "/var/lib/postgresql/data" || return 1
  container_mounts_volume \
    "${redis_container}" \
    "${TARGET_REDIS_VOLUME}" \
    "/data" || return 1
  identity="$(
    docker exec "${postgres_container}" sh -ec \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -F "|" -v ON_ERROR_STOP=1 -U "$1" -d "$2" -p 3327 -c "SELECT current_user, current_database()"' \
      sh "${TARGET_POSTGRES_USER}" "${TARGET_POSTGRES_DB}" 2>/dev/null
  )" || return 1
  [[ "${identity}" == "${TARGET_POSTGRES_USER}|${TARGET_POSTGRES_DB}" ]]
}

assert_equal() {
  local name="$1"
  local actual="$2"
  local expected="$3"
  [[ "${actual}" == "${expected}" ]] ||
    die "${name} must be ${expected} before migration; found ${actual:-<empty>}"
}

preflight() {
  [[ "${EUID}" -eq 0 ]] || die "Run this production migration as root."
  [[ -f "${COMPOSE_FILE}" ]] || die "Compose file not found: ${COMPOSE_FILE}"
  [[ -f "${ENV_FILE}" ]] || die "Production environment file not found: ${ENV_FILE}"

  for command_name in docker flock sha256sum diff awk sed sort df curl grep; do
    require_command "${command_name}"
  done
  docker compose version >/dev/null

  COMPOSE_PROJECT_NAME="$(read_env_value "${ENV_FILE}" COMPOSE_PROJECT_NAME)"
  POSTGRES_VOLUME_NAME="$(read_env_value "${ENV_FILE}" POSTGRES_VOLUME_NAME)"
  REDIS_VOLUME_NAME="$(read_env_value "${ENV_FILE}" REDIS_VOLUME_NAME)"
  POSTGRES_USER="$(read_env_value "${ENV_FILE}" POSTGRES_USER)"
  POSTGRES_DB="$(read_env_value "${ENV_FILE}" POSTGRES_DB)"
  DATABASE_URL="$(read_env_value "${ENV_FILE}" DATABASE_URL)"
  DOCKER_DATABASE_URL="$(read_env_value "${ENV_FILE}" DOCKER_DATABASE_URL)"

  if is_target_already_active; then
    log "Production already uses ${TARGET_PROJECT} and the isolated target volumes."
    exit 0
  fi

  assert_equal "COMPOSE_PROJECT_NAME" "${COMPOSE_PROJECT_NAME:-}" "${SOURCE_PROJECT}"
  assert_equal "POSTGRES_VOLUME_NAME" "${POSTGRES_VOLUME_NAME:-}" "${SOURCE_POSTGRES_VOLUME}"
  assert_equal "REDIS_VOLUME_NAME" "${REDIS_VOLUME_NAME:-}" "${SOURCE_REDIS_VOLUME}"
  assert_equal "POSTGRES_USER" "${POSTGRES_USER:-}" "${SOURCE_POSTGRES_USER}"
  assert_equal "POSTGRES_DB" "${POSTGRES_DB:-}" "${SOURCE_POSTGRES_DB}"
  [[ "${DATABASE_URL:-}" == postgresql://${SOURCE_POSTGRES_USER}:* ]] ||
    die "DATABASE_URL does not use the expected source PostgreSQL role."
  [[ "${DATABASE_URL:-}" == */${SOURCE_POSTGRES_DB}\?* ]] ||
    die "DATABASE_URL does not use the expected source database."
  [[ "${DOCKER_DATABASE_URL:-}" == postgresql://${SOURCE_POSTGRES_USER}:* ]] ||
    die "DOCKER_DATABASE_URL does not use the expected source PostgreSQL role."
  [[ "${DOCKER_DATABASE_URL:-}" == */${SOURCE_POSTGRES_DB}\?* ]] ||
    die "DOCKER_DATABASE_URL does not use the expected source database."

  docker volume inspect "${SOURCE_POSTGRES_VOLUME}" >/dev/null
  docker volume inspect "${SOURCE_REDIS_VOLUME}" >/dev/null

  if docker volume inspect "${TARGET_POSTGRES_VOLUME}" >/dev/null 2>&1; then
    die "Target PostgreSQL volume already exists: ${TARGET_POSTGRES_VOLUME}"
  fi
  if docker volume inspect "${TARGET_REDIS_VOLUME}" >/dev/null 2>&1; then
    die "Target Redis volume already exists: ${TARGET_REDIS_VOLUME}"
  fi
  if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${TARGET_PROJECT}")" ]]; then
    die "Target Compose project already has containers: ${TARGET_PROJECT}"
  fi

  for service in postgres redis api-core ai-gateway web nginx; do
    local container_id
    local status
    container_id="$(service_container "${ENV_FILE}" "${SOURCE_PROJECT}" "${service}")"
    [[ -n "${container_id}" ]] || die "Source service is missing: ${service}"
    status="$(container_health "${container_id}")"
    [[ "${status}" == "healthy" || "${status}" == "running" ]] ||
      die "Source service ${service} is not healthy: ${status}"
  done

  SOURCE_POSTGRES_CONTAINER="$(service_container "${ENV_FILE}" "${SOURCE_PROJECT}" postgres)"
  SOURCE_REDIS_CONTAINER="$(service_container "${ENV_FILE}" "${SOURCE_PROJECT}" redis)"
  POSTGRES_PASSWORD="$(container_env_value "${SOURCE_POSTGRES_CONTAINER}" POSTGRES_PASSWORD)"
  assert_equal \
    "source container POSTGRES_USER" \
    "$(container_env_value "${SOURCE_POSTGRES_CONTAINER}" POSTGRES_USER)" \
    "${SOURCE_POSTGRES_USER}"
  assert_equal \
    "source container POSTGRES_DB" \
    "$(container_env_value "${SOURCE_POSTGRES_CONTAINER}" POSTGRES_DB)" \
    "${SOURCE_POSTGRES_DB}"
  [[ -n "${POSTGRES_PASSWORD}" ]] || die "Source PostgreSQL password is empty."

  local available_kb
  available_kb="$(df -Pk "${ROOT_DIR}" | awk 'NR == 2 {print $4}')"
  [[ "${available_kb}" =~ ^[0-9]+$ ]] || die "Unable to determine free disk space."
  ((available_kb >= 1048576)) ||
    die "At least 1 GiB of free disk space is required."

}

print_dry_run_plan() {
  cat <<EOF
Read-only preflight passed.

Source:
  Compose project: ${SOURCE_PROJECT}
  PostgreSQL volume: ${SOURCE_POSTGRES_VOLUME}
  Redis volume: ${SOURCE_REDIS_VOLUME}
  PostgreSQL role/database: ${SOURCE_POSTGRES_USER}/${SOURCE_POSTGRES_DB}

Target:
  Compose project: ${TARGET_PROJECT}
  PostgreSQL volume: ${TARGET_POSTGRES_VOLUME}
  Redis volume: ${TARGET_REDIS_VOLUME}
  PostgreSQL role/database: ${TARGET_POSTGRES_USER}/${TARGET_POSTGRES_DB}

Execution plan:
  1. Create timestamped online and final PostgreSQL backups.
  2. Pause public application writes.
  3. Persist and back up Redis.
  4. Restore PostgreSQL into a new isolated volume.
  5. Compare schema, every table row count/content digest, and every sequence.
  6. Atomically switch .env.production and start ${TARGET_PROJECT}.
  7. Verify container and public HTTP health.
  8. Keep ${SOURCE_PROJECT} containers and both source volumes for rollback.

Backup root: ${BACKUP_ROOT}
No production data was changed in --dry-run mode.
EOF
}

create_backup_directory() {
  umask 077
  BACKUP_DIR="${BACKUP_ROOT}/${RUN_ID}"
  ENV_BACKUP="${BACKUP_DIR}/.env.production.before-migration"
  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"
  cp -p "${ENV_FILE}" "${ENV_BACKUP}"
  chmod 600 "${ENV_BACKUP}"

  cat >"${BACKUP_DIR}/migration-metadata.txt" <<EOF
run_id=${RUN_ID}
started_at=$(date --iso-8601=seconds)
source_project=${SOURCE_PROJECT}
source_postgres_volume=${SOURCE_POSTGRES_VOLUME}
source_redis_volume=${SOURCE_REDIS_VOLUME}
source_postgres_identity=${SOURCE_POSTGRES_USER}/${SOURCE_POSTGRES_DB}
target_project=${TARGET_PROJECT}
target_postgres_volume=${TARGET_POSTGRES_VOLUME}
target_redis_volume=${TARGET_REDIS_VOLUME}
target_postgres_identity=${TARGET_POSTGRES_USER}/${TARGET_POSTGRES_DB}
old_rollback_assets_retained=${KEEP_OLD_ROLLBACK_ASSETS}
EOF
}

dump_database() {
  local container_id="$1"
  local user="$2"
  local database="$3"
  local output_file="$4"

  docker exec "${container_id}" sh -ec \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -U "$1" -d "$2" -p 3327 -Fc --no-owner --no-acl' \
    sh "${user}" "${database}" >"${output_file}"
  [[ -s "${output_file}" ]] || die "Database backup is empty: ${output_file}"
  docker run --rm -i postgres:17-alpine pg_restore --list <"${output_file}" >/dev/null
}

dump_schema() {
  local container_id="$1"
  local user="$2"
  local database="$3"
  local output_file="$4"

  docker exec "${container_id}" sh -ec \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -U "$1" -d "$2" -p 3327 -Fp --schema-only --no-owner --no-acl' \
    sh "${user}" "${database}" >"${output_file}"
  [[ -s "${output_file}" ]] || die "Database schema backup is empty: ${output_file}"

  awk '
    /^\\restrict / { print "\\restrict MIGRATION_CHECK"; next }
    /^\\unrestrict / { print "\\unrestrict MIGRATION_CHECK"; next }
    { print }
  ' "${output_file}" >"${output_file}.normalized"
  mv "${output_file}.normalized" "${output_file}"
}

database_manifest() {
  local container_id="$1"
  local user="$2"
  local database="$3"
  local output_file="$4"
  local generated_sql

  generated_sql="$(
    docker exec "${container_id}" sh -ec \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d "$2" -p 3327 -c "$3"' \
      sh "${user}" "${database}" "
        SELECT format(
          'SELECT %L || E''\\t'' || count(*)::text || E''\\t'' || md5(COALESCE(string_agg(md5(row_to_json(t)::text), '''' ORDER BY md5(row_to_json(t)::text)), '''')) FROM %I.%I AS t;',
          schemaname || '.' || tablename,
          schemaname,
          tablename
        )
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY schemaname, tablename;
      "
  )"

  [[ -n "${generated_sql}" ]] || die "No public tables found while building the database manifest."

  printf '%s\n' "${generated_sql}" |
    docker exec -i "${container_id}" sh -ec \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d "$2" -p 3327' \
      sh "${user}" "${database}" |
    LC_ALL=C sort >"${output_file}"

  [[ -s "${output_file}" ]] || die "Database manifest is empty: ${output_file}"
}

sequence_manifest() {
  local container_id="$1"
  local user="$2"
  local database="$3"
  local output_file="$4"
  local generated_sql

  generated_sql="$(
    docker exec "${container_id}" sh -ec \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d "$2" -p 3327 -c "$3"' \
      sh "${user}" "${database}" "
        SELECT format(
          'SELECT %L || E''\\t'' || last_value::text || E''\\t'' || is_called::text || E''\\t'' || %L || E''\\t'' || %L || E''\\t'' || %L || E''\\t'' || %L || E''\\t'' || %L FROM %I.%I;',
          schemaname || '.' || sequencename,
          start_value::text,
          min_value::text,
          max_value::text,
          increment_by::text,
          cycle::text,
          schemaname,
          sequencename
        )
        FROM pg_sequences
        WHERE schemaname = 'public'
        ORDER BY schemaname, sequencename;
      "
  )"

  if [[ -z "${generated_sql}" ]]; then
    : >"${output_file}"
    return 0
  fi

  printf '%s\n' "${generated_sql}" |
    docker exec -i "${container_id}" sh -ec \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d "$2" -p 3327' \
      sh "${user}" "${database}" |
    LC_ALL=C sort >"${output_file}"
}

create_online_backup() {
  log "Creating online preflight database backup."
  dump_database \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-online.dump"
  dump_schema \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-online-schema.sql"
  database_manifest \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-online-tables.tsv"
  sequence_manifest \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-online-sequences.tsv"
}

pause_application_writes() {
  log "Pausing public application services."
  WRITES_PAUSED=1
  source_compose stop nginx web api-core ai-gateway
}

create_final_backup() {
  log "Creating final database backup after writes are paused."
  dump_database \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-final.dump"
  dump_schema \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-final-schema.sql"
  database_manifest \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-final-tables.tsv"
  sequence_manifest \
    "${SOURCE_POSTGRES_CONTAINER}" \
    "${SOURCE_POSTGRES_USER}" \
    "${SOURCE_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-final-sequences.tsv"
}

backup_and_copy_redis() {
  log "Persisting and copying Redis into the isolated volume."
  docker exec "${SOURCE_REDIS_CONTAINER}" redis-cli -p 3328 SAVE >/dev/null
  local source_dbsize
  source_dbsize="$(
    docker exec "${SOURCE_REDIS_CONTAINER}" redis-cli --raw -p 3328 DBSIZE |
      tr -d '\r\n'
  )"
  [[ "${source_dbsize}" =~ ^[0-9]+$ ]] || die "Unable to read source Redis DBSIZE."
  printf 'dbsize\t%s\n' "${source_dbsize}" >"${BACKUP_DIR}/redis-source-dbsize.tsv"
  source_compose stop redis

  docker run --rm \
    -v "${SOURCE_REDIS_VOLUME}:/source:ro" \
    -v "${BACKUP_DIR}:/backup" \
    alpine:3.20 \
    sh -ec 'tar -czf /backup/redis-final-data.tar.gz -C /source .'

  redis_volume_manifest \
    "${SOURCE_REDIS_VOLUME}" \
    "${BACKUP_DIR}/redis-source-volume.tsv"

  docker volume create "${TARGET_REDIS_VOLUME}" >/dev/null
  docker run --rm \
    -v "${SOURCE_REDIS_VOLUME}:/source:ro" \
    -v "${TARGET_REDIS_VOLUME}:/target" \
    alpine:3.20 \
    sh -ec 'cd /source && cp -a . /target/'

  redis_volume_manifest \
    "${TARGET_REDIS_VOLUME}" \
    "${BACKUP_DIR}/redis-target-volume.tsv"
  diff -u \
    "${BACKUP_DIR}/redis-source-volume.tsv" \
    "${BACKUP_DIR}/redis-target-volume.tsv"
}

redis_volume_manifest() {
  local volume_name="$1"
  local output_file="$2"

  docker run --rm \
    -v "${volume_name}:/data:ro" \
    alpine:3.20 \
    sh -ec 'cd /data && find . -type f -exec sha256sum {} \; | sort' \
    >"${output_file}"
}

restore_target_database() {
  log "Restoring PostgreSQL into the isolated target volume."
  local normalized_run_id
  normalized_run_id="$(printf '%s' "${RUN_ID}" | tr '[:upper:]' '[:lower:]')"
  TARGET_POSTGRES_CONTAINER="xueleai-production-isolation-postgres-${normalized_run_id}"
  RUNTIME_POSTGRES_ENV="${RUNTIME_DIR}/${TARGET_POSTGRES_CONTAINER}.env"

  umask 077
  {
    printf 'POSTGRES_USER=%s\n' "${TARGET_POSTGRES_USER}"
    printf 'POSTGRES_PASSWORD=%s\n' "${POSTGRES_PASSWORD}"
    printf 'POSTGRES_DB=%s\n' "${TARGET_POSTGRES_DB}"
  } >"${RUNTIME_POSTGRES_ENV}"
  chmod 600 "${RUNTIME_POSTGRES_ENV}"

  docker volume create "${TARGET_POSTGRES_VOLUME}" >/dev/null
  docker run -d \
    --name "${TARGET_POSTGRES_CONTAINER}" \
    --env-file "${RUNTIME_POSTGRES_ENV}" \
    -v "${TARGET_POSTGRES_VOLUME}:/var/lib/postgresql/data" \
    postgres:17-alpine \
    postgres -p 3327 >/dev/null

  for _ in {1..60}; do
    if docker exec "${TARGET_POSTGRES_CONTAINER}" \
      pg_isready -U "${TARGET_POSTGRES_USER}" -d "${TARGET_POSTGRES_DB}" -p 3327 \
      >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  docker exec "${TARGET_POSTGRES_CONTAINER}" \
    pg_isready -U "${TARGET_POSTGRES_USER}" -d "${TARGET_POSTGRES_DB}" -p 3327 \
    >/dev/null

  docker exec -i "${TARGET_POSTGRES_CONTAINER}" sh -ec \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_restore --exit-on-error --no-owner --no-acl -U "$1" -d "$2" -p 3327' \
    sh "${TARGET_POSTGRES_USER}" "${TARGET_POSTGRES_DB}" \
    <"${BACKUP_DIR}/postgres-final.dump"

  dump_schema \
    "${TARGET_POSTGRES_CONTAINER}" \
    "${TARGET_POSTGRES_USER}" \
    "${TARGET_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-restored-schema.sql"
  database_manifest \
    "${TARGET_POSTGRES_CONTAINER}" \
    "${TARGET_POSTGRES_USER}" \
    "${TARGET_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-restored-tables.tsv"
  sequence_manifest \
    "${TARGET_POSTGRES_CONTAINER}" \
    "${TARGET_POSTGRES_USER}" \
    "${TARGET_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-restored-sequences.tsv"
}

compare_database_manifests() {
  log "Comparing source and restored database manifests."
  diff -u \
    "${BACKUP_DIR}/postgres-final-schema.sql" \
    "${BACKUP_DIR}/postgres-restored-schema.sql"
  diff -u \
    "${BACKUP_DIR}/postgres-final-tables.tsv" \
    "${BACKUP_DIR}/postgres-restored-tables.tsv"
  diff -u \
    "${BACKUP_DIR}/postgres-final-sequences.tsv" \
    "${BACKUP_DIR}/postgres-restored-sequences.tsv"

  cp "${BACKUP_DIR}/postgres-final-tables.tsv" "${BACKUP_DIR}/verified-table-manifest.tsv"
  cp "${BACKUP_DIR}/postgres-final-sequences.tsv" "${BACKUP_DIR}/verified-sequence-manifest.tsv"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local next_file="${file}.next"
  local found=0
  local line

  : >"${next_file}"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${key}="* ]]; then
      printf '%s=%s\n' "${key}" "${value}" >>"${next_file}"
      found=1
    else
      printf '%s\n' "${line}" >>"${next_file}"
    fi
  done <"${file}"

  if [[ "${found}" -eq 0 ]]; then
    printf '%s=%s\n' "${key}" "${value}" >>"${next_file}"
  fi

  mv "${next_file}" "${file}"
}

replace_env_database_identity() {
  local file="$1"
  local key="$2"
  local next_file="${file}.next"
  local found=0
  local line
  local updated

  : >"${next_file}"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${key}="* ]]; then
      updated="$(
        printf '%s\n' "${line}" |
          sed \
            -e "s#postgresql://${SOURCE_POSTGRES_USER}:#postgresql://${TARGET_POSTGRES_USER}:#" \
            -e "s#/${SOURCE_POSTGRES_DB}?#/${TARGET_POSTGRES_DB}?#"
      )"
      [[ "${updated}" != "${line}" ]] ||
        die "Unable to update ${key} without reserializing its secret."
      [[ "${updated}" == *"postgresql://${TARGET_POSTGRES_USER}:"* ]] ||
        die "${key} target role validation failed."
      [[ "${updated}" == *"/${TARGET_POSTGRES_DB}?"* ]] ||
        die "${key} target database validation failed."
      printf '%s\n' "${updated}" >>"${next_file}"
      found=$((found + 1))
    else
      printf '%s\n' "${line}" >>"${next_file}"
    fi
  done <"${file}"

  [[ "${found}" -eq 1 ]] || die "Expected exactly one ${key} entry."
  mv "${next_file}" "${file}"
}

switch_environment() {
  log "Atomically switching the production environment to isolated identifiers."
  local temporary_env="${ENV_FILE}.migration-${RUN_ID}"
  cp -p "${ENV_FILE}" "${temporary_env}"

  replace_env_database_identity "${temporary_env}" "DATABASE_URL"
  replace_env_database_identity "${temporary_env}" "DOCKER_DATABASE_URL"
  set_env_value "${temporary_env}" "POSTGRES_USER" "${TARGET_POSTGRES_USER}"
  set_env_value "${temporary_env}" "POSTGRES_DB" "${TARGET_POSTGRES_DB}"
  set_env_value "${temporary_env}" "COMPOSE_PROJECT_NAME" "${TARGET_PROJECT}"
  set_env_value "${temporary_env}" "POSTGRES_VOLUME_NAME" "${TARGET_POSTGRES_VOLUME}"
  set_env_value "${temporary_env}" "REDIS_VOLUME_NAME" "${TARGET_REDIS_VOLUME}"

  chmod 600 "${temporary_env}"
  ENV_SWITCHED=1
  mv "${temporary_env}" "${ENV_FILE}"
}

write_rollback_script() {
  local rollback_script="${BACKUP_DIR}/rollback.sh"

  cat >"${rollback_script}" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${ROOT_DIR}"
COMPOSE_FILE="${COMPOSE_FILE}"
ENV_FILE="${ENV_FILE}"
ENV_BACKUP="${ENV_BACKUP}"
LOCK_FILE="${LOCK_FILE}"
SOURCE_PROJECT="${SOURCE_PROJECT}"
TARGET_PROJECT="${TARGET_PROJECT}"

compose_clean() {
  local env_file="\$1"
  local project="\$2"
  shift 2
  local -a clean_environment=(
    env
    -i
    "PATH=\${PATH}"
    "HOME=\${HOME:-/root}"
  )
  local docker_variable

  for docker_variable in DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG DOCKER_CERT_PATH DOCKER_TLS_VERIFY; do
    if [[ -n "\${!docker_variable:-}" ]]; then
      clean_environment+=("\${docker_variable}=\${!docker_variable}")
    fi
  done

  "\${clean_environment[@]}" docker compose \
    --env-file "\${env_file}" \
    -f "\${COMPOSE_FILE}" \
    -p "\${project}" \
    "\$@"
}

wait_for_service() {
  local service="\$1"
  local container_id=""
  local status=""

  for _ in {1..60}; do
    container_id="\$(compose_clean "\${ENV_FILE}" "\${SOURCE_PROJECT}" ps -q "\${service}" 2>/dev/null || true)"
    if [[ -n "\${container_id}" ]]; then
      status="\$(docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "\${container_id}" 2>/dev/null || true)"
      if [[ "\${status}" == "healthy" || "\${status}" == "running" ]]; then
        return 0
      fi
      if [[ "\${status}" == "unhealthy" || "\${status}" == "exited" || "\${status}" == "dead" ]]; then
        printf 'ERROR: rollback service %s entered terminal state: %s\n' "\${service}" "\${status}" >&2
        return 1
      fi
    fi
    sleep 2
  done

  printf 'ERROR: timed out waiting for rollback service %s; last state: %s\n' \
    "\${service}" "\${status:-unknown}" >&2
  return 1
}

verify_public_endpoints() {
  curl --fail --silent --show-error --max-time 30 \
    https://xueleai.com/api/health >/dev/null
  curl --fail --silent --show-error --max-time 30 \
    https://xueleai.com/api/system-config/public >/dev/null
  curl --fail --silent --show-error --max-time 30 \
    https://xueleai.com/media-tutor >/dev/null
}

cd "\${ROOT_DIR}"
[[ "\${EUID}" -eq 0 ]] || {
  echo "ERROR: run rollback as root." >&2
  exit 1
}
[[ -f "\${ENV_BACKUP}" ]] || {
  echo "ERROR: environment backup is missing: \${ENV_BACKUP}" >&2
  exit 1
}
exec 9>"\${LOCK_FILE}"
flock -n 9 || {
  echo "ERROR: another production isolation operation is running." >&2
  exit 1
}

compose_clean "\${ENV_FILE}" "\${TARGET_PROJECT}" \
  stop nginx web api-core ai-gateway redis postgres || true
cp -p "\${ENV_BACKUP}" "\${ENV_FILE}.rollback"
mv "\${ENV_FILE}.rollback" "\${ENV_FILE}"
compose_clean "\${ENV_FILE}" "\${SOURCE_PROJECT}" \
  up -d postgres redis api-core ai-gateway web nginx
for service in postgres redis api-core ai-gateway web nginx; do
  wait_for_service "\${service}"
done
verify_public_endpoints
compose_clean "\${ENV_FILE}" "\${SOURCE_PROJECT}" ps
echo "Rollback completed and verified."
EOF
  chmod 700 "${rollback_script}"
}

finalize_checksums() {
  (
    cd "${BACKUP_DIR}"
    find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 |
      LC_ALL=C sort -z |
      xargs -0 sha256sum >SHA256SUMS
    sha256sum --check SHA256SUMS >/dev/null
  )
}

cleanup_runtime() {
  if [[ -n "${TARGET_POSTGRES_CONTAINER}" ]] &&
    docker container inspect "${TARGET_POSTGRES_CONTAINER}" >/dev/null 2>&1; then
    docker stop --time 30 "${TARGET_POSTGRES_CONTAINER}" >/dev/null 2>&1 || true
    docker rm -f "${TARGET_POSTGRES_CONTAINER}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${RUNTIME_POSTGRES_ENV}" ]]; then
    rm -f "${RUNTIME_POSTGRES_ENV}"
  fi
  rm -f "${ENV_FILE}.migration-${RUN_ID}" "${ENV_FILE}.migration-${RUN_ID}.next"
}

verify_rollback_health() {
  local service

  for service in postgres redis api-core ai-gateway web nginx; do
    wait_for_project_service "${ENV_FILE}" "${SOURCE_PROJECT}" "${service}" || return 1
  done
  verify_public_endpoints || return 1
}

rollback_environment() {
  local original_status="${1:-1}"
  local rollback_failed=0
  local environment_restored=1

  trap - ERR INT TERM
  ROLLBACK_IN_PROGRESS=1
  set +e

  if [[ "${WRITES_PAUSED}" -eq 1 && "${MIGRATION_COMPLETE}" -eq 0 ]]; then
    log "Migration did not complete; restoring the old production project."
    cleanup_runtime

    if [[ "${ENV_SWITCHED}" -eq 1 ]]; then
      if ! compose_with_env "${ENV_FILE}" "${TARGET_PROJECT}" \
        stop nginx web api-core ai-gateway redis postgres >/dev/null 2>&1; then
        log "Warning: target project stop returned a non-zero status."
      fi
      if [[ -n "${ENV_BACKUP}" && -f "${ENV_BACKUP}" ]]; then
        if ! cp -p "${ENV_BACKUP}" "${ENV_FILE}.rollback" ||
          ! mv "${ENV_FILE}.rollback" "${ENV_FILE}"; then
          environment_restored=0
          rollback_failed=1
        fi
      else
        environment_restored=0
        rollback_failed=1
      fi
    fi

    if [[ "${environment_restored}" -eq 1 ]]; then
      if ! compose_with_env "${ENV_FILE}" "${SOURCE_PROJECT}" \
        up -d postgres redis api-core ai-gateway web nginx; then
        rollback_failed=1
      elif ! verify_rollback_health; then
        rollback_failed=1
      fi
    fi

    if [[ -n "${BACKUP_DIR}" && -f "${BACKUP_DIR}/migration-metadata.txt" ]]; then
      {
        printf 'rollback_at=%s\n' "$(date --iso-8601=seconds)"
        if [[ "${rollback_failed}" -eq 0 ]]; then
          printf 'result=automatic_rollback_verified\n'
        else
          printf 'result=automatic_rollback_failed\n'
        fi
      } >>"${BACKUP_DIR}/migration-metadata.txt"
    fi

    if [[ "${rollback_failed}" -ne 0 ]]; then
      printf 'FATAL: automatic rollback could not be verified; immediate operator action is required.\n' >&2
      exit 70
    fi
    log "Automatic rollback completed and the old production health checks passed."
  fi

  exit "${original_status}"
}

on_error() {
  local status="$?"
  trap - ERR INT TERM
  rollback_environment "${status}"
}

on_interrupt() {
  trap - ERR INT TERM
  rollback_environment 130
}

assert_container_volume() {
  local container_id="$1"
  local expected_volume="$2"
  local expected_destination="$3"

  if ! container_mounts_volume \
    "${container_id}" \
    "${expected_volume}" \
    "${expected_destination}"; then
    die "Container does not mount ${expected_volume} at ${expected_destination}."
    return 1
  fi
}

verify_live_data_services() {
  log "Revalidating the real Compose data containers before opening the application."
  local postgres_container
  local redis_container
  local identity
  local target_dbsize

  postgres_container="$(service_container "${ENV_FILE}" "${TARGET_PROJECT}" postgres)"
  redis_container="$(service_container "${ENV_FILE}" "${TARGET_PROJECT}" redis)"
  [[ -n "${postgres_container}" ]] || die "Target PostgreSQL container is missing."
  [[ -n "${redis_container}" ]] || die "Target Redis container is missing."

  identity="$(
    docker exec "${postgres_container}" sh -ec \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -F "|" -v ON_ERROR_STOP=1 -U "$1" -d "$2" -p 3327 -c "SELECT current_user, current_database()"' \
      sh "${TARGET_POSTGRES_USER}" "${TARGET_POSTGRES_DB}"
  )"
  [[ "${identity}" == "${TARGET_POSTGRES_USER}|${TARGET_POSTGRES_DB}" ]] ||
    die "The live PostgreSQL role/database identity is not the isolated target."

  dump_schema \
    "${postgres_container}" \
    "${TARGET_POSTGRES_USER}" \
    "${TARGET_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-live-schema.sql"
  database_manifest \
    "${postgres_container}" \
    "${TARGET_POSTGRES_USER}" \
    "${TARGET_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-live-tables.tsv"
  sequence_manifest \
    "${postgres_container}" \
    "${TARGET_POSTGRES_USER}" \
    "${TARGET_POSTGRES_DB}" \
    "${BACKUP_DIR}/postgres-live-sequences.tsv"

  diff -u \
    "${BACKUP_DIR}/postgres-final-schema.sql" \
    "${BACKUP_DIR}/postgres-live-schema.sql"
  diff -u \
    "${BACKUP_DIR}/postgres-final-tables.tsv" \
    "${BACKUP_DIR}/postgres-live-tables.tsv"
  diff -u \
    "${BACKUP_DIR}/postgres-final-sequences.tsv" \
    "${BACKUP_DIR}/postgres-live-sequences.tsv"

  target_dbsize="$(
    docker exec "${redis_container}" redis-cli --raw -p 3328 DBSIZE |
      tr -d '\r\n'
  )"
  [[ "${target_dbsize}" =~ ^[0-9]+$ ]] || die "Unable to read target Redis DBSIZE."
  printf 'dbsize\t%s\n' "${target_dbsize}" >"${BACKUP_DIR}/redis-live-dbsize.tsv"
  diff -u \
    "${BACKUP_DIR}/redis-source-dbsize.tsv" \
    "${BACKUP_DIR}/redis-live-dbsize.tsv"
}

start_target_project() {
  log "Stopping the temporary restore container and old database."
  cleanup_runtime
  source_compose stop postgres

  switch_environment

  log "Starting isolated PostgreSQL and Redis services."
  target_compose up -d postgres redis
  wait_for_project_service "${ENV_FILE}" "${TARGET_PROJECT}" postgres
  wait_for_project_service "${ENV_FILE}" "${TARGET_PROJECT}" redis

  assert_container_volume \
    "$(service_container "${ENV_FILE}" "${TARGET_PROJECT}" postgres)" \
    "${TARGET_POSTGRES_VOLUME}" \
    "/var/lib/postgresql/data"
  assert_container_volume \
    "$(service_container "${ENV_FILE}" "${TARGET_PROJECT}" redis)" \
    "${TARGET_REDIS_VOLUME}" \
    "/data"

  log "Applying pending Prisma migrations to the restored database."
  target_compose run --rm api-core pnpm db:migrate:deploy

  verify_live_data_services

  log "Starting the complete isolated production stack."
  target_compose up -d --remove-orphans nginx web api-core ai-gateway postgres redis
  for service in postgres redis api-core ai-gateway web nginx; do
    wait_for_project_service "${ENV_FILE}" "${TARGET_PROJECT}" "${service}"
  done
}

verify_public_endpoints() {
  curl --fail --silent --show-error --max-time 30 \
    https://xueleai.com/api/health >/dev/null
  curl --fail --silent --show-error --max-time 30 \
    https://xueleai.com/api/system-config/public >/dev/null
  curl --fail --silent --show-error --max-time 30 \
    https://xueleai.com/media-tutor >/dev/null
}

verify_public_health() {
  log "Verifying public production endpoints."
  verify_public_endpoints
}

execute_migration() {
  create_backup_directory
  write_rollback_script
  create_online_backup
  pause_application_writes
  create_final_backup
  backup_and_copy_redis
  restore_target_database
  compare_database_manifests
  finalize_checksums
  start_target_project
  verify_public_health

  cat >>"${BACKUP_DIR}/migration-metadata.txt" <<EOF
completed_at=$(date --iso-8601=seconds)
result=success
backup_checksums=verified
EOF
  finalize_checksums

  MIGRATION_COMPLETE=1
  WRITES_PAUSED=0
  trap - ERR INT TERM

  log "Migration completed successfully."
  log "Backup directory: ${BACKUP_DIR}"
  log "Rollback command: ${BACKUP_DIR}/rollback.sh"
  log "Old project and old volumes were retained."
}

main() {
  case "${1:-}" in
    --dry-run | --execute)
      MODE="${1}"
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac

  [[ "${EUID}" -eq 0 ]] || die "Run this production migration as root."
  exec 9>"${LOCK_FILE}"
  flock -n 9 || die "Another production isolation migration is already running."

  preflight

  if [[ "${MODE}" == "--dry-run" ]]; then
    print_dry_run_plan
    exit 0
  fi

  trap on_error ERR
  trap on_interrupt INT TERM
  execute_migration
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
