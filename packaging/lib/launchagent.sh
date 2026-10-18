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
  local dir="${HOME}/Library/LaunchAgents"
  local plist=""
  local product=""
  local log_file=""
  mkdir -p "$dir"
  plist="$(launch_agent_plist_path)"
  product="${cursor_app}/Contents/Resources/app/product.json"
  log_file="$(cursor_zh_log_file)"
  mkdir -p "$(dirname "$log_file")"
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
