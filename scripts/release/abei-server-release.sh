#!/usr/bin/env bash
# Run on the Abei origin only, after GitHub SHA and public artifact checks.
set -euo pipefail
umask 077
[[ "$PWD" == /opt/abei && ! -e .git ]] || { echo '必须在 /opt/abei 非 Git 发布目录执行' >&2; exit 1; }
sha="${1:?需要完整提交 SHA}"
archive="${2:?需要私有传输的代码 tar 路径}"
[[ "$sha" =~ ^[0-9a-f]{40}$ && -f "$archive" && -f .env.production ]] || { echo '发布参数或生产配置缺失' >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for command in docker python3 rsync openssl; do command -v "$command" >/dev/null; done
for host in new.abeiai.com mcp.abeiai.com; do
  cert="/etc/letsencrypt/live/$host"
  [[ -s "$cert/fullchain.pem" && -s "$cert/privkey.pem" ]] || { echo "证书缺失：$host，未修改在线服务" >&2; exit 1; }
  openssl x509 -in "$cert/fullchain.pem" -noout -checkend 86400 >/dev/null
  openssl x509 -in "$cert/fullchain.pem" -noout -checkhost "$host" >/dev/null
 done
stage="$(mktemp -d /opt/abei-stage.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
python3 "$script_dir/abei-archive.py" extract "$sha" "$archive" "$stage"
[[ -f "$stage/docker-compose.abei-prod.yml" && -f "$stage/deploy/abei/production.conf" ]] || exit 1
# Validate both certificates and route config before touching maintenance or live files.
docker run --rm --network abei-prod_default -v "$stage/deploy/abei/production.conf:/etc/nginx/conf.d/default.conf:ro" -v /etc/letsencrypt:/etc/letsencrypt:ro nginx:1.27-alpine nginx -t
export APP_RELEASE_SHA="$sha"
compose=(docker compose --project-name abei-prod --env-file /opt/abei/.env.production -f /opt/abei/docker-compose.abei-prod.yml)
# Build in the staged tree using only the explicit production env; no secret is copied into it.
docker compose --project-name abei-prod --env-file /opt/abei/.env.production -f "$stage/docker-compose.abei-prod.yml" build web api-core ai-gateway
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/opt/abei/deploy/data/backups/creator-$stamp"
mkdir -p "$backup" deploy/data/state
cp docker-compose.abei-prod.yml "$backup/compose.yml"
cp deploy/abei/production.conf "$backup/nginx.conf"
[[ ! -f RELEASE_COMMIT ]] || cp RELEASE_COMMIT "$backup/RELEASE_COMMIT"
for service in web api-core ai-gateway; do
  container="$("${compose[@]}" ps -q "$service")"
  [[ -n "$container" ]] || { echo "旧服务未运行：$service" >&2; exit 1; }
  image="$(docker inspect --format '{{.Image}}' "$container")"
  docker image tag "$image" "abei-$service:rollback-$stamp"
  printf '%s %s\n' "$service" "$image" >> "$backup/images.txt"
done
# Freeze all old writers before snapshot backfill. On failure keep maintenance enabled.
touch deploy/data/state/maintenance.enabled
"${compose[@]}" stop api-core
"${compose[@]}" exec -T postgres pg_dump -U abei -p 3604 -d abei -Fc > "$backup/database.dump"
[[ -s "$backup/database.dump" ]]
# Only release source roots are replaced; preserve runtime env/data/certs and all volumes.
for directory in apps packages scripts; do
  rsync -a --delete --exclude='.env*' --exclude='uploads/' --exclude='logs/' --exclude='private-*/' --exclude='private-data/' --exclude='backups/' --exclude='node_modules/' --exclude='.next/' --exclude='dist/' --exclude='generated/' --exclude='vendor/' "$stage/$directory/" "/opt/abei/$directory/"
done
rsync -a --delete "$stage/deploy/abei/" /opt/abei/deploy/abei/
for file in package.json pnpm-lock.yaml pnpm-workspace.yaml .dockerignore docker-compose.abei-prod.yml RELEASE_COMMIT; do cp "$stage/$file" "/opt/abei/$file"; done
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --no-deps api-core web ai-gateway
for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T api-core node -e 'Promise.all(["health","health/db","health/redis"].map(p=>fetch("http://127.0.0.1:3602/api/"+p).then(r=>{if(!r.ok)throw Error()}))).catch(()=>process.exit(1))'; then break; fi
  [[ "$attempt" -lt 60 ]] || { echo "健康检查失败；维护保留，私有备份：$backup" >&2; exit 1; }
  sleep 2
done
# Start/recreate ingress only after successful validation; it still serves maintenance.
"${compose[@]}" up -d --no-deps abei
"${compose[@]}" exec -T abei nginx -t
rm deploy/data/state/maintenance.enabled
printf '服务器切换完成；必须继续执行线上 API/页面/协议验收。回滚备份：%s\n' "$backup"
