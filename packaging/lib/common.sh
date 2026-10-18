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

file_owner_uid() {
  if stat -c %u "$1" 2>/dev/null; then
    return 0
  fi
  stat -f %u "$1"
}

# True when this path, or something inside it, is not owned by uid.
path_needs_reclaim() {
  local path="$1"
  local uid="$2"
  [[ -e "$path" ]] || return 1
  local owner=""
  owner="$(file_owner_uid "$path" 2>/dev/null || true)"
  if [[ -z "$owner" ]]; then
    return 1
  fi
  if [[ "$owner" != "$uid" ]]; then
    return 0
  fi
  if [[ -d "$path" ]]; then
    local foreign=""
    foreign="$(find "$path" ! -user "$uid" -print 2>/dev/null | head -n 1 || true)"
    if [[ -n "$foreign" ]]; then
      return 0
    fi
  fi
  return 1
}

# Gatekeeper runs a quarantined app from a disposable read-only path.
# Downloads and other read-only volumes have the same problem: the app
# disappears or cannot clear quarantine, so the user must move it first.
installer_must_move() {
  local app_root="${1:-${CURSOR_ZH_APP_ROOT:-}}"
  if [[ -z "$app_root" ]]; then
    return 1
  fi
  case "$app_root" in
    */AppTranslocation/*) return 0 ;;
    */Downloads|*/Downloads/*|*/downloads|*/downloads/*) return 0 ;;
  esac
  if [[ "${CURSOR_ZH_VOLUME_READONLY:-}" == 1 ]]; then
    return 0
  fi
  if [[ ! -d "$app_root" ]]; then
    return 1
  fi
  local probe="${app_root}/.cursor-zh-write-probe"
  local errfile=""
  local err=""
  errfile="$(mktemp)"
  if touch "$probe" 2>"$errfile"; then
    rm -f "$probe" "$errfile"
    return 1
  fi
  err="$(cat "$errfile" 2>/dev/null || true)"
  rm -f "$errfile"
  case "$err" in
    *"Read-only file system"*|*"read-only file system"*) return 0 ;;
  esac
  return 1
}

# Match this Cursor.app only. Helpers of this app include the same path
# prefix; another install's "Cursor Helper" does not.
cursor_is_running() {
  local app="${1:-}"
  if [[ -z "$app" ]]; then
    return 1
  fi
  local needle="${app}/Contents/MacOS/Cursor"
  local line=""
  local found=1
  if ! command -v ps >/dev/null 2>&1; then
    return 1
  fi
  while IFS= read -r line; do
    case "$line" in
      *"$needle"*) found=0 ;;
    esac
  done < <(ps -ax -o command= 2>/dev/null || true)
  return "$found"
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
