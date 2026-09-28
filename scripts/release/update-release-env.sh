#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 6 ]]; then
  echo "用法：update-release-env.sh <env-file> <version> <release-sha> <web-image> <api-image> <ai-image>" >&2
  exit 1
fi

env_file="$1"
version="$2"
release_sha="$3"
web_image="$4"
api_image="$5"
ai_image="$6"

if [[ ! -f "${env_file}" ]]; then
  echo "错误：环境变量文件不存在：${env_file}" >&2
  exit 1
fi

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "错误：版本号不合法：${version}" >&2
  exit 1
fi

if [[ ! "${release_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "错误：发布提交必须是 40 位小写 Git SHA。" >&2
  exit 1
fi

for image in "${web_image}" "${api_image}" "${ai_image}"; do
  if [[ -z "${image}" || "${image}" == *$'\n'* || "${image}" == *$'\r'* ]]; then
    echo "错误：镜像标签不合法。" >&2
    exit 1
  fi
done

env_dir="$(cd "$(dirname "${env_file}")" && pwd)"
env_name="$(basename "${env_file}")"
temp_file="$(mktemp "${env_dir}/.${env_name}.release.XXXXXX")"

cleanup() {
  rm -f "${temp_file}"
}

trap cleanup EXIT

awk -F= '
  $1 != "APP_VERSION" &&
  $1 != "APP_RELEASE_SHA" &&
  $1 != "WEB_IMAGE" &&
  $1 != "API_CORE_IMAGE" &&
  $1 != "AI_GATEWAY_IMAGE" {
    print
  }
' "${env_file}" > "${temp_file}"

{
  printf 'APP_VERSION="%s"\n' "${version}"
  printf 'APP_RELEASE_SHA="%s"\n' "${release_sha}"
  printf 'WEB_IMAGE="%s"\n' "${web_image//\"/\\\"}"
  printf 'API_CORE_IMAGE="%s"\n' "${api_image//\"/\\\"}"
  printf 'AI_GATEWAY_IMAGE="%s"\n' "${ai_image//\"/\\\"}"
} >> "${temp_file}"

if mode="$(stat -c '%a' "${env_file}" 2>/dev/null)"; then
  chmod "${mode}" "${temp_file}"
  if owner="$(stat -c '%u:%g' "${env_file}" 2>/dev/null)"; then
    chown "${owner}" "${temp_file}"
  fi
else
  mode="$(stat -f '%Lp' "${env_file}")"
  chmod "${mode}" "${temp_file}"
fi

mv -f "${temp_file}" "${env_file}"
trap - EXIT
