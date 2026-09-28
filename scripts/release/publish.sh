#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
RELEASE_SHA="${RELEASE_SHA:-$(git rev-parse --verify HEAD)}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-registry.example.com}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-xueleai}"
IMAGE_PROJECT="${IMAGE_PROJECT:-xueleai}"
PLATFORM="${PLATFORM:-linux/amd64}"

if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "错误：版本号不合法：${VERSION}"
  exit 1
fi

if [[ ! "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "错误：发布提交必须是 40 位小写 Git SHA。"
  exit 1
fi

if [[ -z "${IMAGE_REGISTRY}" || -z "${IMAGE_NAMESPACE}" || -z "${IMAGE_PROJECT}" ]]; then
  echo "错误：请配置 IMAGE_REGISTRY、IMAGE_NAMESPACE 和 IMAGE_PROJECT。"
  exit 1
fi

RELEASE_TAG="${VERSION}-${RELEASE_SHA}"
WEB_IMAGE="${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/${IMAGE_PROJECT}:web-${RELEASE_TAG}"
API_CORE_IMAGE="${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/${IMAGE_PROJECT}:api-core-${RELEASE_TAG}"
AI_GATEWAY_IMAGE="${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/${IMAGE_PROJECT}:ai-gateway-${RELEASE_TAG}"

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

echo "发布版本：${VERSION}"
echo "发布提交：${RELEASE_SHA}"
echo "镜像标签："
echo "  web:        ${WEB_IMAGE}"
echo "  api-core:   ${API_CORE_IMAGE}"
echo "  ai-gateway: ${AI_GATEWAY_IMAGE}"

run docker buildx build \
  --platform "${PLATFORM}" \
  --file apps/web/Dockerfile \
  --build-arg "APP_VERSION=${VERSION}" \
  --build-arg "APP_RELEASE_SHA=${RELEASE_SHA}" \
  --tag "${WEB_IMAGE}" \
  --push \
  .

run docker buildx build \
  --platform "${PLATFORM}" \
  --file apps/api-core/Dockerfile \
  --build-arg "APP_VERSION=${VERSION}" \
  --build-arg "APP_RELEASE_SHA=${RELEASE_SHA}" \
  --tag "${API_CORE_IMAGE}" \
  --push \
  .

run docker buildx build \
  --platform "${PLATFORM}" \
  --file apps/ai-gateway/Dockerfile \
  --build-arg "APP_VERSION=${VERSION}" \
  --build-arg "APP_RELEASE_SHA=${RELEASE_SHA}" \
  --tag "${AI_GATEWAY_IMAGE}" \
  --push \
  .

echo "发布流程完成。"
