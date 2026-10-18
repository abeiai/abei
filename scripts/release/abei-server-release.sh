#!/usr/bin/env bash
# Run on the Abei origin only, after GitHub SHA and public artifact checks.
set -euo pipefail
umask 077
[[ "$PWD" == /opt/abei && ! -e .git ]] || { echo '必须在 /opt/abei 非 Git 发布目录执行' >&2; exit 1; }
sha="${1:?需要完整提交 SHA}"
archive="${2:?需要私有传输的代码 tar 路径}"
[[ "$sha" =~ ^[0-9a-f]{40}$ && -f "$archive" && -f .env.production ]] || { echo '发布参数或生产配置缺失' >&2; exit 1; }
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
probe_script=/opt/abei/scripts/release/abei-ingress-probe.mjs
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
# The API image needs host networking for apt mirrors on this origin. Buildx supports it
# directly, while this host's Compose Bake path rejects the network.host entitlement.
# Opt in only on low-space origins; removes idle build cache, never images or volumes.
prune_build_cache() {
  if [[ "${ABEI_PRUNE_BUILD_CACHE:-0}" == "1" ]]; then
    docker builder prune --all --force
  fi
}
app_version="$(docker compose --project-name abei-prod --env-file /opt/abei/.env.production -f "$stage/docker-compose.abei-prod.yml" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["api-core"]["build"]["args"]["APP_VERSION"])')"
docker buildx build --allow network.host --network host --load \
  --build-arg "APP_VERSION=$app_version" --build-arg "APP_RELEASE_SHA=$sha" \
  --file "$stage/apps/api-core/Dockerfile" --tag "abei-api-core:$sha" "$stage"
prune_build_cache
docker compose --project-name abei-prod --env-file /opt/abei/.env.production -f "$stage/docker-compose.abei-prod.yml" build web ai-gateway
prune_build_cache
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
# Uploads live at cwd/workspace roots; nested Next src/app/uploads routes are source.
for directory in apps packages scripts; do
  rsync -a --delete --exclude='.env*' --exclude='/uploads/' --exclude='/*/uploads/' --exclude='logs/' --exclude='private-*/' --exclude='private-data/' --exclude='backups/' --exclude='node_modules/' --exclude='.next/' --exclude='dist/' --exclude='/database/generated/' --exclude='vendor/' "$stage/$directory/" "/opt/abei/$directory/"
done
rsync -a --delete "$stage/deploy/abei/" /opt/abei/deploy/abei/
for file in package.json pnpm-lock.yaml pnpm-workspace.yaml .dockerignore docker-compose.abei-prod.yml RELEASE_COMMIT; do cp "$stage/$file" "/opt/abei/$file"; done
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --no-deps api-core web ai-gateway
for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T api-core node -e 'if(process.env.APP_RELEASE_SHA!==process.argv[1])process.exit(1); Promise.all(["health","health/db","health/redis"].map(p=>fetch("http://127.0.0.1:3602/api/"+p,{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error()}))).catch(()=>process.exit(1))' "$sha" \
    && "${compose[@]}" exec -T web node -e 'if(process.env.APP_RELEASE_SHA!==process.argv[1])process.exit(1); fetch("http://127.0.0.1:3601/creator",{signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok||!(await r.text()).includes("阿贝绘本创作助手"))throw Error()}).catch(()=>process.exit(1))' "$sha" \
    && "${compose[@]}" exec -T ai-gateway python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:3603/health", timeout=5).read()'; then break; fi
  [[ "$attempt" -lt 60 ]] || { echo "服务就绪检查失败；维护保留，私有备份：$backup" >&2; exit 1; }
  sleep 2
done
# Bind-mounted config may have a new inode; force replacement, not just nginx -t.
"${compose[@]}" up -d --no-deps --force-recreate abei
"${compose[@]}" exec -T abei nginx -t
[[ -f deploy/data/state/maintenance.enabled ]]
ingress="$("${compose[@]}" ps -q abei)"
[[ -n "$ingress" && -f "$probe_script" ]]
# Share only the ingress network namespace; normal TLS verification is mandatory.
docker run --rm --read-only --network "container:$ingress" --entrypoint node \
  -v "$probe_script:/abei-ingress-probe.mjs:ro" \
  "abei-api-core:$sha" /abei-ingress-probe.mjs
rm deploy/data/state/maintenance.enabled
printf '服务器切换完成；必须继续执行线上 API/页面/协议验收。回滚备份：%s\n' "$backup"
