#!/usr/bin/env bash
# User LaunchAgent that re-applies the patch after Cursor updates.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

LAUNCH_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${LAUNCH_LIB}/common.sh"

launch_agent_label() {
  printf '%s\n' "com.po1nt9.cursor-zh-hans.watch"
}

launch_agent_plist_path() {
  printf '%s\n' "${HOME}/Library/LaunchAgents/$(launch_agent_label).plist"
}

support_runtime_dir() {
  printf '%s\n' "$(support_dir)/runtime"
}

copy_file_into() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  rm -f "$dest"
  cp -L "$src" "$dest"
}

copy_dir_into() {
  local src="$1"
  local dest="$2"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$src"/. "$dest"/
}

# Copy the watcher off the .app. A translocated or deleted app must not be
# the path launchd uses later. Only the node arch we resolved is copied.
# The 15-minute poll does not copy anything. A repeat install recopies node
# only when runtime/version changed, so the ~110 MB binary is not copied again.
stage_support_runtime() {
  local node="$1"
  local watch="$2"
  local pack="$3"
  local runtime=""
  local scripts_src=""
  local name=""
  local version="unknown"
  local existing=""
  local reuse_node=0
  runtime="$(support_runtime_dir)"
  if [[ ! -e "$node" || ! -f "$watch" || ! -d "$pack" ]]; then
    cursor_zh_log "没能准备自动安装用的文件。"
    return 1
  fi
  if [[ -n "${CURSOR_ZH_RESOURCES:-}" && -f "${CURSOR_ZH_RESOURCES}/version" ]]; then
    version="$(tr -d '[:space:]' < "${CURSOR_ZH_RESOURCES}/version")"
  elif [[ -f "${pack}/package.json" ]]; then
    version="$("$node" -e 'const fs=require("fs"); try { const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(p.version||"unknown")); } catch (e) { process.stdout.write("unknown"); }' "${pack}/package.json" 2>/dev/null || true)"
  fi
  if [[ -z "$version" ]]; then
    version="unknown"
  fi
  if [[ "$version" != "unknown" && -x "${runtime}/node/node" && -f "${runtime}/version" ]]; then
    existing="$(tr -d '[:space:]' < "${runtime}/version")"
    if [[ "$existing" == "$version" ]]; then
      reuse_node=1
    fi
  fi
  mkdir -p "${runtime}/node" "${runtime}/scripts"
  if [[ "$reuse_node" -eq 1 ]]; then
    chmod 755 "${runtime}/node/node" || true
  else
    copy_file_into "$node" "${runtime}/node/node"
    chmod 755 "${runtime}/node/node"
  fi
  scripts_src="$(cd "$(dirname "$watch")" && pwd)"
  for name in common.sh dialogs.sh watch.sh; do
    if [[ -f "${scripts_src}/${name}" ]]; then
      copy_file_into "${scripts_src}/${name}" "${runtime}/scripts/${name}"
      chmod 755 "${runtime}/scripts/${name}"
    fi
  done
  if [[ ! -f "${runtime}/scripts/watch.sh" || ! -f "${runtime}/scripts/common.sh" || ! -f "${runtime}/scripts/dialogs.sh" ]]; then
    cursor_zh_log "监视脚本没有复制完整。"
    return 1
  fi
  copy_dir_into "$pack" "${runtime}/pack"
  printf '%s\n' "$version" > "${runtime}/version"
  if command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine "$runtime" 2>/dev/null || true
  fi
}

load_launch_agent() {
  local plist="$1"
  if [[ "${CURSOR_ZH_SKIP_LAUNCHCTL:-}" == 1 ]]; then
    return 0
  fi
  local label=""
  local domain=""
  label="$(launch_agent_label)"
  domain="gui/$(id -u)"
  launchctl bootout "${domain}/${label}" >/dev/null 2>&1 || true
  if launchctl bootstrap "$domain" "$plist" >/dev/null 2>&1; then
    return 0
  fi
  launchctl load -w "$plist" >/dev/null 2>&1
}

install_launch_agent() {
  local cursor_app="$1"
  local node="$2"
  local watch="$3"
  local pack="$4"
  stage_support_runtime "$node" "$watch" "$pack" || return 1
  local runtime=""
  runtime="$(support_runtime_dir)"
  node="${runtime}/node/node"
  watch="${runtime}/scripts/watch.sh"
  pack="${runtime}/pack"
  local dir="${HOME}/Library/LaunchAgents"
  local plist=""
  local product=""
  local log_file=""
  mkdir -p "$dir"
  plist="$(launch_agent_plist_path)"
  product="${cursor_app}/Contents/Resources/app/product.json"
  log_file="$(cursor_zh_log_file)"
  mkdir -p "$(dirname "$log_file")"
  # WatchPaths sees edits to product.json. Replacing the whole Cursor.app
  # often does not fire it, so StartInterval polls every 15 minutes as well.
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "$(launch_agent_label)")</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml_escape "$watch")</string>
    <string>--cursor-app</string>
    <string>$(xml_escape "$cursor_app")</string>
    <string>--node</string>
    <string>$(xml_escape "$node")</string>
    <string>--pack</string>
    <string>$(xml_escape "$pack")</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>$(xml_escape "$product")</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>900</integer>
  <key>ThrottleInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$log_file")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$log_file")</string>
</dict>
</plist>
EOF
  load_launch_agent "$plist"
}

unload_launch_agent() {
  if [[ "${CURSOR_ZH_SKIP_LAUNCHCTL:-}" == 1 ]]; then
    return 0
  fi
  local label=""
  local domain=""
  local plist=""
  label="$(launch_agent_label)"
  domain="gui/$(id -u)"
  plist="$(launch_agent_plist_path)"
  launchctl bootout "${domain}/${label}" >/dev/null 2>&1 || true
  launchctl unload -w "$plist" >/dev/null 2>&1 || true
}

remove_launch_agent() {
  local plist=""
  plist="$(launch_agent_plist_path)"
  unload_launch_agent || true
  rm -f "$plist"
  rm -f "$(support_dir)/watch-notified"
}
