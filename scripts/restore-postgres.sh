#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "用法：CONFIRM_RESTORE=YES DATABASE_URL=... scripts/restore-postgres.sh <backup-file>"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "错误：备份文件不存在：${BACKUP_FILE}"
  exit 1
fi

if [[ -z "${DATABASE_URL}" ]]; then
  echo "错误：请先设置 DATABASE_URL。"
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "恢复会覆盖目标数据库对象。确认执行请设置 CONFIRM_RESTORE=YES。"
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "错误：未找到 pg_restore，请先安装 PostgreSQL 客户端工具。"
  exit 1
fi

pg_database_url="${DATABASE_URL}"

if [[ "${pg_database_url}" =~ ^(.+)\?schema=([^&]+)$ ]]; then
  pg_database_url="${BASH_REMATCH[1]}"
fi

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="${pg_database_url}" \
  "${BACKUP_FILE}"

echo "数据库恢复已完成：${BACKUP_FILE}"
