#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-${BACKUP_DIR:-backups/postgres}}"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "错误：请先设置 DATABASE_URL。"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "错误：未找到 pg_dump，请先安装 PostgreSQL 客户端工具。"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_file="${BACKUP_DIR}/xueleai-${timestamp}.dump"
pg_database_url="${DATABASE_URL}"
schema_args=()

if [[ "${pg_database_url}" =~ ^(.+)\?schema=([^&]+)$ ]]; then
  pg_database_url="${BASH_REMATCH[1]}"
  schema_args+=(--schema="${BASH_REMATCH[2]}")
fi

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  "${schema_args[@]}" \
  --file="${backup_file}" \
  "${pg_database_url}"

echo "数据库备份已完成：${backup_file}"
