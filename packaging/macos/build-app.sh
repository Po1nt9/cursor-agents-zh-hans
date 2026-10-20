#!/usr/bin/env bash
# Build Cursor 汉化.app and Cursor-zh-hans-macOS.zip on Linux (or macOS).
# The bundle is hand-assembled: Info.plist, a shell launcher, the pack, and
# official Node.js binaries for darwin arm64 and x64.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_VERSION="${CURSOR_ZH_NODE_VERSION:-22.23.3}"
DIST="${CURSOR_ZH_DIST:-${ROOT}/dist}"
STUB=0

for arg in "$@"; do
  case "$arg" in
    --stub) STUB=1 ;;
    *)
      printf '%s\n' "不认识的参数：${arg}" >&2
      exit 1
      ;;
  esac
done

if [[ -n "${CURSOR_ZH_NODE_STUB:-}" && "${CURSOR_ZH_NODE_STUB}" == 1 ]]; then
  STUB=1
fi

if [[ -n "${CURSOR_ZH_VERSION:-}" ]]; then
  VERSION="${CURSOR_ZH_VERSION}"
elif [[ -n "${GITHUB_REF:-}" && "${GITHUB_REF}" == refs/tags/v* ]]; then
  VERSION="${GITHUB_REF#refs/tags/v}"
else
  VERSION="$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "${ROOT}/package.json" | head -n 1)"
fi

if [[ -z "${VERSION}" ]]; then
  printf '%s\n' "没有读到版本号。" >&2
  exit 1
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return 0
  fi
  shasum -a 256 "$1" | awk '{print $1}'
}

write_stub_node() {
  local dest="$1"
  local label="$2"
  mkdir -p "$(dirname "$dest")"
  {
    printf '%s\n' "#!/bin/bash"
    printf '%s\n' "printf '%s\\n' \"cursor-zh-stub-node ${label}\""
  } > "$dest"
  chmod 755 "$dest"
}

download_node() {
  local arch="$1"
  local dest="$2"
  local name="node-v${NODE_VERSION}-darwin-${arch}.tar.gz"
  local url="https://nodejs.org/dist/v${NODE_VERSION}/${name}"
  local tmp=""
  local expected=""
  local actual=""
  tmp="$(mktemp -d)"
  printf '%s\n' "下载官方 Node.js ${NODE_VERSION} darwin-${arch}"
  curl -fL --retry 3 --retry-delay 2 -o "${tmp}/${name}" "$url"
  curl -fL --retry 3 --retry-delay 2 -o "${tmp}/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  expected="$(awk -v file="$name" '$2 == file { print $1 }' "${tmp}/SHASUMS256.txt")"
  actual="$(hash_file "${tmp}/${name}")"
  if [[ -z "$expected" || "$expected" != "$actual" ]]; then
    printf '%s\n' "Node.js 校验和不一致：${name}" >&2
    rm -rf "$tmp"
    exit 1
  fi
  tar -xzf "${tmp}/${name}" -C "$tmp"
  mkdir -p "$(dirname "$dest")"
  cp "${tmp}/node-v${NODE_VERSION}-darwin-${arch}/bin/node" "$dest"
  chmod 755 "$dest"
  rm -rf "$tmp"
}

stage="$(mktemp -d)"
cleanup() {
  rm -rf "$stage"
}
trap cleanup EXIT

APP="${stage}/Cursor 汉化.app"
mkdir -p "${APP}/Contents/MacOS" "${APP}/Contents/Resources/scripts" "${APP}/Contents/Resources/node/arm64" "${APP}/Contents/Resources/node/x64"

sed "s/__VERSION__/${VERSION}/g" "${ROOT}/packaging/macos/Info.plist.template" > "${APP}/Contents/Info.plist"
printf 'APPL????' > "${APP}/Contents/PkgInfo"
printf '%s\n' "$VERSION" > "${APP}/Contents/Resources/version"

cp "${ROOT}/packaging/macos/launcher.sh" "${APP}/Contents/MacOS/launcher"
chmod 755 "${APP}/Contents/MacOS/launcher"
cp "${ROOT}/packaging/lib/"*.sh "${APP}/Contents/Resources/scripts/"
chmod 755 "${APP}/Contents/Resources/scripts/"*.sh

mkdir -p "${APP}/Contents/Resources/pack"
cp -R "${ROOT}/bin" "${ROOT}/src" "${ROOT}/dictionary" "${APP}/Contents/Resources/pack/"
cp "${ROOT}/package.json" "${ROOT}/LICENSE" "${APP}/Contents/Resources/pack/"

if [[ "$STUB" -eq 1 ]]; then
  write_stub_node "${APP}/Contents/Resources/node/arm64/node" "arm64"
  write_stub_node "${APP}/Contents/Resources/node/x64/node" "x64"
else
  download_node "arm64" "${APP}/Contents/Resources/node/arm64/node"
  download_node "x64" "${APP}/Contents/Resources/node/x64/node"
fi

mkdir -p "$DIST"
OUT="${DIST}/Cursor-zh-hans-macOS.zip"
rm -f "$OUT"
python3 "${ROOT}/packaging/macos/zip_app.py" "$APP" "$OUT"
if [[ "$STUB" -eq 1 ]]; then
  python3 "${ROOT}/packaging/macos/zip_app.py" --check "$OUT"
else
  python3 "${ROOT}/packaging/macos/zip_app.py" --check --require-macho "$OUT"
fi
printf '%s\n' "$OUT"
