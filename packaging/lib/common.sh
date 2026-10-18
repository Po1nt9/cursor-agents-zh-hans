#!/usr/bin/env bash
# Shared helpers for the double-click app and the update watcher.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

if [[ "${CURSOR_ZH_COMMON_LOADED:-}" == 1 ]]; then
  return 0
fi
CURSOR_ZH_COMMON_LOADED=1

# gui.sh fills these after each CLI run. They live here so every sourced file shares them.
# shellcheck disable=SC2034
CLI_STDOUT=""
# shellcheck disable=SC2034
CLI_STDERR=""

cursor_zh_log_file() {
  if [[ -n "${CURSOR_ZH_LOG_FILE:-}" ]]; then
    printf '%s\n' "$CURSOR_ZH_LOG_FILE"
    return 0
  fi
  printf '%s\n' "${HOME}/Library/Logs/cursor-zh-hans.log"
}

cursor_zh_log() {
  local file=""
  file="$(cursor_zh_log_file)"
  mkdir -p "$(dirname "$file")"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$file"
}

support_dir() {
  printf '%s\n' "${HOME}/Library/Application Support/cursor-zh-hans"
}

node_arch_for() {
  case "$1" in
    arm64|aarch64) printf '%s\n' "arm64" ;;
    x86_64|amd64) printf '%s\n' "x64" ;;
    *) return 1 ;;
  esac
}

resolve_node() {
  if [[ -n "${CURSOR_ZH_NODE:-}" ]]; then
    if [[ -x "${CURSOR_ZH_NODE}" ]]; then
      printf '%s\n' "${CURSOR_ZH_NODE}"
      return 0
    fi
    return 1
  fi
  local arch=""
  local bundled=""
  arch="$(node_arch_for "$(uname -m)")" || return 1
  if [[ -n "${CURSOR_ZH_RESOURCES:-}" && -d "${CURSOR_ZH_RESOURCES}/node" ]]; then
    bundled="${CURSOR_ZH_RESOURCES}/node/${arch}/node"
    if [[ -x "$bundled" ]]; then
      printf '%s\n' "$bundled"
      return 0
    fi
    return 1
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  return 1
}

resolve_pack() {
  if [[ -n "${CURSOR_ZH_PACK:-}" ]]; then
    printf '%s\n' "$CURSOR_ZH_PACK"
    return 0
  fi
  if [[ -n "${CURSOR_ZH_RESOURCES:-}" && -f "${CURSOR_ZH_RESOURCES}/pack/bin/cursor-zh.js" ]]; then
    printf '%s\n' "${CURSOR_ZH_RESOURCES}/pack"
    return 0
  fi
  local here=""
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${here}/../.." || return 1
  pwd
}

is_app_writable() {
  local app="$1"
  [[ -w "$app" && -w "$app/Contents/Resources/app" ]]
}

cursor_is_running() {
  if command -v pgrep >/dev/null 2>&1; then
    if pgrep -x Cursor >/dev/null 2>&1; then
      return 0
    fi
    if pgrep -f "Cursor Helper" >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

file_mtime() {
  if stat -c %Y "$1" 2>/dev/null; then
    return 0
  fi
  stat -f %m "$1"
}

output_says_empty_entitlements() {
  case "$1" in
    *"没有留下 entitlements"*|*"没有 entitlements"*) return 0 ;;
    *) return 1 ;;
  esac
}

output_says_admin_cancelled() {
  case "$1" in
    *"User canceled"*|*"User cancelled"*|*"(-128)"*) return 0 ;;
    *) return 1 ;;
  esac
}

output_says_no_backup() {
  case "$1" in
    *"原始备份"*) return 0 ;;
    *) return 1 ;;
  esac
}

truncate_text() {
  local text="$1"
  local max="$2"
  if [[ "${#text}" -le "$max" ]]; then
    printf '%s\n' "$text"
    return 0
  fi
  printf '%s\n…（后面的内容在日志文件里）\n' "${text:0:max}"
}

xml_escape() {
  local text="$1"
  text="${text//&/&amp;}"
  text="${text//</&lt;}"
  text="${text//>/&gt;}"
  text="${text//\"/&quot;}"
  printf '%s' "$text"
}
