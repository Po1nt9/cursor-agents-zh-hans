#!/usr/bin/env bash
# Silently re-apply the Chinese patch after Cursor.app changes version.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

WATCH_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${WATCH_LIB}/common.sh"
# shellcheck source=dialogs.sh
source "${WATCH_LIB}/dialogs.sh"

read_install_facts() {
  local product="$1"
  local html="$2"
  local state="$3"
  "$(resolve_node)" - "$product" "$html" "$state" <<'JS'
const fs = require("fs");
const productPath = process.argv[2];
const htmlPath = process.argv[3];
const statePath = process.argv[4];
const product = JSON.parse(fs.readFileSync(productPath, "utf8"));
let injected = false;
try {
  injected = fs.readFileSync(htmlPath, "utf8").includes("cursor-zh-hans:start");
} catch (error) {
  injected = false;
}
let state = null;
try {
  state = JSON.parse(fs.readFileSync(statePath, "utf8"));
} catch (error) {
  state = null;
}
const version = String(product.version || "");
const commit = String(product.commit || "");
const same = Boolean(state && state.cursorVersion === version && state.cursorCommit === commit);
const need = !(injected && same);
const mismatch = injected && !same;
process.stdout.write("need=" + (need ? "yes" : "no") + "\n");
process.stdout.write("mismatch=" + (mismatch ? "yes" : "no") + "\n");
process.stdout.write("version=" + version + "\n");
process.stdout.write("commit=" + commit + "\n");
JS
}

watch_fact() {
  local info="$1"
  local key="$2"
  local line=""
  while IFS= read -r line; do
    case "$line" in
      "${key}="*)
        printf '%s\n' "${line#"${key}"=}"
        return 0
        ;;
    esac
  done <<< "$info"
  return 1
}

# Prints one word: missing, skip, wait, manual, unwritable, apply.
watch_decide() {
  local app="$1"
  local product="${app}/Contents/Resources/app/product.json"
  local html="${app}/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html"
  local state="${app}/Contents/Resources/app/.cursor-zh-hans/state.json"
  if [[ ! -f "$product" ]]; then
    printf '%s\n' "missing"
    return 0
  fi
  local info=""
  if ! info="$(read_install_facts "$product" "$html" "$state")"; then
    printf '%s\n' "missing"
    return 0
  fi
  local need="no"
  local mismatch="no"
  need="$(watch_fact "$info" "need")"
  mismatch="$(watch_fact "$info" "mismatch")"
  if [[ "$need" != "yes" ]]; then
    printf '%s\n' "skip"
    return 0
  fi
  if cursor_is_running "$app"; then
    printf '%s\n' "wait"
    return 0
  fi
  if [[ "$mismatch" == "yes" ]]; then
    printf '%s\n' "manual"
    return 0
  fi
  if ! is_app_writable "$app"; then
    printf '%s\n' "unwritable"
    return 0
  fi
  printf '%s\n' "apply"
}

watch_version_key() {
  local app="$1"
  local product="${app}/Contents/Resources/app/product.json"
  "$(resolve_node)" -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(p.version||"")+" "+String(p.commit||""));' "$product"
}

notify_once() {
  local key="$1"
  local message="$2"
  local file=""
  file="$(support_dir)/watch-notified"
  mkdir -p "$(dirname "$file")"
  if [[ -f "$file" ]] && [[ "$(cat "$file")" == "$key" ]]; then
    return 0
  fi
  printf '%s\n' "$key" > "$file"
  notify_user "$message"
}

acquire_watch_lock() {
  local lock="$1"
  if [[ -d "$lock" ]]; then
    local now=""
    local mtime=""
    local age=0
    now="$(date +%s)"
    mtime="$(file_mtime "$lock")"
    age=$((now - mtime))
    if [[ "$age" -gt 1800 ]]; then
      rmdir "$lock" 2>/dev/null || true
    fi
  fi
  mkdir "$lock" 2>/dev/null
}

watch_main() {
  local cursor_app=""
  local node=""
  local pack=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cursor-app)
        cursor_app="${2:-}"
        shift 2
        ;;
      --node)
        node="${2:-}"
        shift 2
        ;;
      --pack)
        pack="${2:-}"
        shift 2
        ;;
      *)
        cursor_zh_log "自动安装遇到不认识的参数：$1"
        return 1
        ;;
    esac
  done
  if [[ -z "$cursor_app" || -z "$node" || -z "$pack" ]]; then
    cursor_zh_log "自动安装的参数不完整。"
    return 1
  fi
  export CURSOR_ZH_NODE="$node"
  export CURSOR_ZH_PACK="$pack"
  local support=""
  local lock=""
  support="$(support_dir)"
  mkdir -p "$support"
  lock="${support}/watch.lock"
  if ! acquire_watch_lock "$lock"; then
    return 0
  fi
  local decision=""
  decision="$(watch_decide "$cursor_app")"
  cursor_zh_log "自动检查：${decision}"
  local version_key=""
  version_key="$(watch_version_key "$cursor_app" 2>/dev/null || true)"
  local status=0
  case "$decision" in
    apply)
      local out=""
      out="$(run_pack_cli "$cursor_app" apply --update-checksums 2>&1)" || status=$?
      cursor_zh_log "$out"
      if [[ "$status" -eq 0 ]]; then
        rm -f "${support}/watch-notified"
        notify_user "已为新版本的 Cursor 重新装上简体中文。"
        status=0
      else
        notify_once "fail ${version_key}" "自动安装汉化没有成功。请打开「Cursor 汉化」再试一次。"
        status=0
      fi
      ;;
    manual)
      notify_once "manual ${version_key}" "Cursor 更新后，旧的汉化还留在里面。请打开「Cursor 汉化」，先点「恢复英文」，再点「安装汉化」。"
      ;;
    unwritable)
      notify_once "unwritable ${version_key}" "Cursor 更新了。请再打开「Cursor 汉化」，点一次「安装汉化」。这次会问管理员密码。"
      ;;
    *)
      ;;
  esac
  rmdir "$lock" 2>/dev/null || true
  return "$status"
}

# Defined here so watch.sh does not need the GUI. Same argv shape as the app.
run_pack_cli() {
  local app="$1"
  shift
  local node=""
  local pack=""
  node="$(resolve_node)"
  pack="$(resolve_pack)"
  "$node" "${pack}/bin/cursor-zh.js" "$@" --app-path "$app" --no-sudo
}

if [[ "${CURSOR_ZH_LIB_ONLY:-}" == 1 ]]; then
  :
elif [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then
  watch_main "$@"
fi
