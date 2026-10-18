#!/usr/bin/env bash
# Menu flow for 「Cursor 汉化」: install, restore, status.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

GUI_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${GUI_LIB}/common.sh"
# shellcheck source=find-cursor.sh
source "${GUI_LIB}/find-cursor.sh"
# shellcheck source=dialogs.sh
source "${GUI_LIB}/dialogs.sh"
# shellcheck source=launchagent.sh
source "${GUI_LIB}/launchagent.sh"

ENTITLEMENTS_USER_MESSAGE='Cursor 的系统权限是空的，这次没法安全地完成汉化。

请用浏览器打开 cursor.com，重新下载并安装 Cursor。装好之后，再打开「Cursor 汉化」，点一次「安装汉化」。

只重装这个小工具没用，需要重装 Cursor 本身。'

ADMIN_CANCEL_MESSAGE='已取消。没有输入管理员密码，所以没有修改 Cursor。

如果 Cursor 装在「应用程序」里，安装时需要这台 Mac 的开机密码。'

INSTALL_OK_MESSAGE='已经装好简体中文，Cursor 正在打开。

如果钥匙串弹出「Cursor Safe Storage」，请点「始终允许」。
点「不允许」的话，Cursor 会像退出了登录。

麦克风或摄像头如果再问一次，按你自己的需要选择就可以。'

resolve_watch_script() {
  if [[ -n "${CURSOR_ZH_WATCH_SCRIPT:-}" ]]; then
    printf '%s\n' "$CURSOR_ZH_WATCH_SCRIPT"
    return 0
  fi
  printf '%s\n' "${GUI_LIB}/watch.sh"
}

run_elevated() {
  local script=""
  local user_name=""
  local user_id=""
  local user_gid=""
  local home_dir=""
  local arg=""
  local cmd=""
  local status=0
  script="$(mktemp "${TMPDIR:-/tmp}/cursor-zh-hans.XXXXXX")"
  user_name="$(id -un)"
  user_id="$(id -u)"
  user_gid="$(id -g)"
  home_dir="${HOME}"
  {
    printf '%s\n' "#!/bin/bash"
    printf 'export SUDO_USER=%q\n' "$user_name"
    printf 'export SUDO_UID=%q\n' "$user_id"
    printf 'export SUDO_GID=%q\n' "$user_gid"
    printf 'export HOME=%q\n' "$home_dir"
    printf 'export PATH=%q\n' "/usr/bin:/bin:/usr/sbin:/sbin"
    printf 'cd %q\n' "$home_dir"
    printf 'exec'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  } > "$script"
  chmod 700 "$script"
  cmd="$(printf '/bin/bash %q' "$script")"
  osascript -e 'on run argv
    do shell script (item 1 of argv) with administrator privileges
  end run' - "$cmd" || status=$?
  rm -f "$script"
  return "$status"
}

run_cli_capture() {
  local app="$1"
  local mode="$2"
  shift 2
  local node=""
  local pack=""
  local errfile=""
  local out=""
  local status=0
  if ! node="$(resolve_node)"; then
    CLI_STDOUT=""
    CLI_STDERR="找不到运行环境"
    return 1
  fi
  pack="$(resolve_pack)"
  errfile="$(mktemp)"
  if [[ "$mode" == "auto" ]] && ! is_app_writable "$app"; then
    out="$(run_elevated "$node" "${pack}/bin/cursor-zh.js" "$@" --app-path "$app" --no-sudo 2>"$errfile")" || status=$?
  else
    out="$("$node" "${pack}/bin/cursor-zh.js" "$@" --app-path "$app" --no-sudo 2>"$errfile")" || status=$?
  fi
  CLI_STDOUT="$out"
  CLI_STDERR=""
  if [[ -s "$errfile" ]]; then
    CLI_STDERR="$(cat "$errfile")"
  fi
  rm -f "$errfile"
  cursor_zh_log "命令：$* --app-path ${app}"
  cursor_zh_log "退出码：${status}"
  if [[ -n "$CLI_STDERR" ]]; then
    cursor_zh_log "$CLI_STDERR"
  fi
  cursor_zh_log "$CLI_STDOUT"
  return "$status"
}

json_is_patched() {
  printf '%s' "$1" | "$(resolve_node)" -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      let report;
      try { report = JSON.parse(raw); }
      catch (error) { process.exit(2); }
      const files = report.files || {};
      const patched = Boolean(files.injected || files.staticMarker || report.state);
      process.exit(patched ? 0 : 1);
    });
  '
}

json_entitlements_missing() {
  printf '%s' "$1" | "$(resolve_node)" -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      let report;
      try { report = JSON.parse(raw); }
      catch (error) { process.exit(2); }
      const missing = Boolean(report.entitlements && report.entitlements.missing === true);
      process.exit(missing ? 0 : 1);
    });
  '
}

format_status_text() {
  printf '%s' "$1" | "$(resolve_node)" -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      const report = JSON.parse(raw);
      const lines = [];
      lines.push(report.files && report.files.injected ? "汉化：已经安装" : "汉化：还没安装");
      lines.push("Cursor 版本：" + (report.product ? report.product.version : "未知"));
      lines.push("位置：" + (report.bundlePath || report.appPath || "未知"));
      if (report.running && report.running.running) lines.push("Cursor 现在开着。");
      else lines.push("Cursor 现在没在运行。");
      if (report.writable === false) lines.push("安装时需要输入这台 Mac 的管理员密码。");
      process.stdout.write(lines.join("\n"));
    });
  '
}

show_cli_error() {
  local summary="$1"
  local detail="$2"
  local log_file=""
  local shown=""
  log_file="$(cursor_zh_log_file)"
  cursor_zh_log "$summary"
  cursor_zh_log "$detail"
  shown="$(truncate_text "$detail" 1200)"
  ui_error_with_copy "${summary}

${shown}

完整记录在这个文件里：
${log_file}" "$detail"
}

quit_cursor_app() {
  osascript -e "tell application id \"${CURSOR_BUNDLE_ID}\" to quit" >/dev/null 2>&1 || \
    osascript -e 'tell application "Cursor" to quit' >/dev/null 2>&1 || true
}

wait_cursor_quit() {
  local i=0
  while [[ "$i" -lt 30 ]]; do
    if ! cursor_is_running; then
      return 0
    fi
    i=$((i + 1))
    sleep "${CURSOR_ZH_POLL_SECONDS:-1}"
  done
  return 1
}

ensure_cursor_quit() {
  if ! cursor_is_running; then
    return 0
  fi
  if ! ui_confirm "Cursor 正在运行。要先退出才能继续。现在退出 Cursor 吗？" "退出并继续" "取消"; then
    ui_alert "已取消。你可以自己完全退出 Cursor 之后，再打开「Cursor 汉化」。"
    return 1
  fi
  quit_cursor_app || true
  if ! wait_cursor_quit; then
    show_cli_error "Cursor 还没有退出。" "等了大约 30 秒，Cursor 仍在运行。请自己退出后再试。"
    return 1
  fi
  return 0
}

relaunch_cursor() {
  open "$1"
}

count_apps() {
  local text="$1"
  local n=0
  local line=""
  if [[ -z "$text" ]]; then
    printf '0\n'
    return 0
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    n=$((n + 1))
  done <<< "$text"
  printf '%s\n' "$n"
}

resolve_target_app() {
  local apps="$1"
  local count=0
  count="$(count_apps "$apps")"
  if [[ "$count" -eq 1 ]]; then
    printf '%s\n' "$apps"
    return 0
  fi
  local prompt=""
  if [[ "$count" -gt 1 ]]; then
    prompt="这台 Mac 上有好几个 Cursor。请选中要汉化的那个 Cursor.app。"
  else
    prompt="没有自动找到 Cursor。请选中 Cursor.app。它一般在「应用程序」里，也可能在别的文件夹，例如 Agent 里面。"
  fi
  local tries=0
  local chosen=""
  while [[ "$tries" -lt 2 ]]; do
    tries=$((tries + 1))
    if ! chosen="$(ui_choose_file "$prompt")"; then
      ui_alert "已取消。"
      return 1
    fi
    chosen="${chosen%/}"
    if cursor_app_is_valid "$chosen"; then
      printf '%s\n' "$chosen"
      return 0
    fi
    ui_alert "这个不是可用的 Cursor。请重新选择 Cursor.app 本身。"
    prompt="请重新选择 Cursor.app。"
  done
  ui_alert "还是没能用这个位置。请确认选中的是 Cursor 应用程序。"
  return 1
}

cmd_status() {
  local app="$1"
  local status=0
  run_cli_capture "$app" read status --json || status=$?
  if [[ "$status" -ne 0 ]]; then
    show_cli_error "没能检查 Cursor。" "${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
    return 1
  fi
  if json_entitlements_missing "$CLI_STDOUT"; then
    ui_warn "$ENTITLEMENTS_USER_MESSAGE"
    return 0
  fi
  local summary=""
  summary="$(format_status_text "$CLI_STDOUT")"
  ui_alert "$summary"
}

cmd_install() {
  local app="$1"
  ensure_cursor_quit || return 1
  local status=0
  local blob=""
  run_cli_capture "$app" read status --json || status=$?
  if [[ "$status" -ne 0 ]]; then
    show_cli_error "没能读到 Cursor 的状态，所以没有安装。" "${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
    return 1
  fi
  if json_is_patched "$CLI_STDOUT"; then
    cursor_zh_log "已经有汉化，先恢复再安装。"
    status=0
    run_cli_capture "$app" auto restore || status=$?
    if [[ "$status" -ne 0 ]]; then
      blob="${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
      if output_says_admin_cancelled "$blob"; then
        ui_alert "$ADMIN_CANCEL_MESSAGE"
        return 1
      fi
      if output_says_empty_entitlements "$blob"; then
        ui_warn "$ENTITLEMENTS_USER_MESSAGE"
        return 1
      fi
      show_cli_error "旧的汉化没能先去掉，所以没有继续安装。" "$blob"
      return 1
    fi
  fi
  status=0
  run_cli_capture "$app" auto apply --update-checksums || status=$?
  if [[ "$status" -ne 0 ]]; then
    blob="${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
    if output_says_admin_cancelled "$blob"; then
      ui_alert "$ADMIN_CANCEL_MESSAGE"
      return 1
    fi
    if output_says_empty_entitlements "$blob"; then
      ui_warn "$ENTITLEMENTS_USER_MESSAGE"
      return 1
    fi
    show_cli_error "安装没有成功。" "$blob"
    return 1
  fi
  if ui_ask_watch; then
    if ! install_launch_agent "$app" "$(resolve_node)" "$(resolve_watch_script)" "$(resolve_pack)"; then
      cursor_zh_log "自动重新安装没有设置成功。"
      ui_alert "汉化已经装上了，但自动重新安装没有设置成功。以后 Cursor 更新后，再打开本程序点一次「安装汉化」。"
    else
      cursor_zh_log "已设置自动重新安装。"
    fi
  else
    cursor_zh_log "用户不需要自动重新安装。"
  fi
  relaunch_cursor "$app" || cursor_zh_log "重新打开 Cursor 没有成功。"
  ui_alert "$INSTALL_OK_MESSAGE"
}

cmd_restore() {
  local app="$1"
  ensure_cursor_quit || return 1
  local status=0
  run_cli_capture "$app" auto restore || status=$?
  local blob="${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
  if output_says_admin_cancelled "$blob"; then
    ui_alert "$ADMIN_CANCEL_MESSAGE"
    return 1
  fi
  remove_launch_agent || true
  if [[ "$status" -ne 0 ]]; then
    if output_says_empty_entitlements "$blob"; then
      ui_warn "$ENTITLEMENTS_USER_MESSAGE"
      return 1
    fi
    show_cli_error "没有恢复成英文。" "$blob"
    return 1
  fi
  relaunch_cursor "$app" || cursor_zh_log "重新打开 Cursor 没有成功。"
  ui_alert "已经恢复成英文，并关掉了自动重新安装。Cursor 正在打开。"
}

gui_main() {
  local preset="${1:-}"
  mkdir -p "$(dirname "$(cursor_zh_log_file)")"
  cursor_zh_log "启动 ${preset:-菜单}"
  if ! resolve_node >/dev/null; then
    ui_warn "找不到运行环境。请重新下载「Cursor 汉化」。"
    return 1
  fi
  local apps=""
  apps="$(find_cursor_apps || true)"
  local app=""
  if ! app="$(resolve_target_app "$apps")"; then
    cursor_zh_log "没有选定 Cursor。"
    return 1
  fi
  cursor_zh_log "使用 ${app}"
  local action=""
  case "$preset" in
    --uninstall|--restore) action="恢复英文" ;;
    --install) action="安装汉化" ;;
    --status) action="检查状态" ;;
    "")
      if ! action="$(ui_menu "请选择要做的事。

找到的 Cursor：
${app}")"; then
        ui_alert "已取消。"
        return 0
      fi
      ;;
    *)
      ui_warn "不认识的参数。"
      return 1
      ;;
  esac
  case "$action" in
    "安装汉化") cmd_install "$app" ;;
    "恢复英文") cmd_restore "$app" ;;
    "检查状态") cmd_status "$app" ;;
    *)
      ui_alert "已取消。"
      return 0
      ;;
  esac
}
