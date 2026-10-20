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

explain_move_app() {
  local message='「Cursor 汉化」现在是从「下载」文件夹或一个临时位置打开的，没法一直留在那里。

请把「Cursor 汉化」拖进「应用程序」，然后从「应用程序」里再打开一次。'
  if ui_confirm "$message" "打开「应用程序」" "好"; then
    open_applications_folder
  fi
}

open_applications_folder() {
  if [[ "${CURSOR_ZH_DRY_RUN:-}" == 1 ]]; then
    printf '%s\n' "OPEN /Applications"
    return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open "/Applications" || true
  fi
}

# do shell script runs as root and can leave root-owned files behind.
# chown only our support dir, our LaunchAgent plist, and our log.
# Install does not call this: the elevated script chowns on EXIT so the
# password dialog is not shown a second time. CLI_ELEVATED is cleared after
# that script returns.
reclaim_user_files() {
  if [[ "${CLI_ELEVATED:-}" != 1 ]]; then
    return 0
  fi
  local uid=""
  local gid=""
  local path=""
  local -a targets=()
  uid="$(id -u)"
  gid="$(id -g)"
  for path in "$(support_dir)" "$(launch_agent_plist_path)" "$(cursor_zh_log_file)"; do
    if path_needs_reclaim "$path" "$uid"; then
      targets+=("$path")
    fi
  done
  if [[ ${#targets[@]} -eq 0 ]]; then
    return 0
  fi
  run_elevated /usr/sbin/chown -R "${uid}:${gid}" "${targets[@]}"
}

# One osascript password covers every command. "::" starts the next command.
# Do not exec: an EXIT trap would never run, and the chown would be skipped.
append_elevated_command() {
  local last="$1"
  shift
  local step=""
  local prev=""
  local arg=""
  for arg in "$@"; do
    if [[ "$prev" == *cursor-zh.js && ( "$arg" == "restore" || "$arg" == "apply" ) ]]; then
      step="$arg"
    fi
    prev="$arg"
  done
  if [[ -n "$step" && -n "${CURSOR_ZH_STEP_FILE:-}" ]]; then
    printf 'printf %%s\\n %q > %q\n' "$step" "$CURSOR_ZH_STEP_FILE"
  fi
  printf '%s\n' "set +e"
  printf '%s' ""
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\nstatus=$?\n'
  if [[ "$last" == 1 ]]; then
    # shellcheck disable=SC2016
    printf '%s\n' 'exit "$status"'
  else
    # shellcheck disable=SC2016
    printf '%s\n' 'if [[ "$status" -ne 0 ]]; then exit "$status"; fi'
  fi
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
  local -a buf=()
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
    printf '%s\n' "reclaim_owned_files() {"
    printf '  local target\n'
    printf '  local owner=%q\n' "${user_id}:${user_gid}"
    printf '  for target in %q %q %q; do\n' "$(support_dir)" "$(launch_agent_plist_path)" "$(cursor_zh_log_file)"
    # shellcheck disable=SC2016
    printf '%s\n' '    if [[ -e "$target" ]]; then'
    # shellcheck disable=SC2016
    printf '%s\n' '      /usr/sbin/chown -R "$owner" "$target" || true'
    printf '%s\n' "    fi"
    printf '%s\n' "  done"
    printf '%s\n' "}"
    printf '%s\n' "trap reclaim_owned_files EXIT"
  } > "$script"
  buf=()
  for arg in "$@"; do
    if [[ "$arg" == "::" ]]; then
      append_elevated_command 0 "${buf[@]}" >> "$script"
      buf=()
    else
      buf+=("$arg")
    fi
  done
  if [[ ${#buf[@]} -gt 0 ]]; then
    append_elevated_command 1 "${buf[@]}" >> "$script"
  fi
  chmod 700 "$script"
  cmd="$(printf '/bin/bash %q' "$script")"
  osascript -e 'on run argv
    do shell script (item 1 of argv) with administrator privileges
  end run' - "$cmd" || status=$?
  rm -f "$script"
  return "$status"
}

# restore and apply share one password. Chown is the EXIT trap inside that script.
run_privileged_cli() {
  local app="$1"
  shift
  local node=""
  local pack=""
  local cli=""
  local sub=""
  local errfile=""
  local out=""
  local status=0
  local stepfile=""
  local -a chain=()
  local first=1
  if ! node="$(resolve_node)"; then
    CLI_STDOUT=""
    CLI_STDERR="找不到运行环境"
    return 1
  fi
  pack="$(resolve_pack)"
  cli="${pack}/bin/cursor-zh.js"
  for sub in "$@"; do
    if [[ "$first" -eq 0 ]]; then
      chain+=("::")
    fi
    first=0
    case "$sub" in
      restore)
        chain+=("$node" "$cli" restore --app-path "$app" --no-sudo)
        ;;
      apply)
        chain+=("$node" "$cli" apply --update-checksums --app-path "$app" --no-sudo)
        ;;
      *)
        CLI_STDOUT=""
        CLI_STDERR="不认识的安装步骤"
        return 1
        ;;
    esac
  done
  errfile="$(mktemp)"
  stepfile="$(mktemp)"
  CURSOR_ZH_STEP_FILE="$stepfile"
  CLI_ELEVATED=1
  out="$(run_elevated "${chain[@]}" 2>"$errfile")" || status=$?
  CLI_ELEVATED=0
  CLI_STEP=""
  if [[ -s "$stepfile" ]]; then
    CLI_STEP="$(cat "$stepfile")"
  fi
  unset CURSOR_ZH_STEP_FILE
  rm -f "$stepfile"
  CLI_STDOUT="$out"
  CLI_STDERR=""
  if [[ -s "$errfile" ]]; then
    CLI_STDERR="$(cat "$errfile")"
  fi
  rm -f "$errfile"
  cursor_zh_log "提权命令：$* --app-path ${app}"
  cursor_zh_log "退出码：${status}"
  if [[ -n "$CLI_STDERR" ]]; then
    cursor_zh_log "$CLI_STDERR"
  fi
  cursor_zh_log "$CLI_STDOUT"
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
  CLI_ELEVATED=0
  if ! node="$(resolve_node)"; then
    CLI_STDOUT=""
    CLI_STDERR="找不到运行环境"
    return 1
  fi
  pack="$(resolve_pack)"
  errfile="$(mktemp)"
  if [[ "$mode" == "auto" ]] && ! is_app_writable "$app"; then
    CLI_ELEVATED=1
    out="$(run_elevated "$node" "${pack}/bin/cursor-zh.js" "$@" --app-path "$app" --no-sudo 2>"$errfile")" || status=$?
    CLI_ELEVATED=0
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
  CLI_ELEVATED=0
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
  local app="${1:-}"
  if [[ -n "$app" ]]; then
    if osascript -e 'on run argv
      tell application (item 1 of argv) to quit
    end run' - "$app" >/dev/null 2>&1; then
      return 0
    fi
  fi
  osascript -e 'on run argv
    tell application id (item 1 of argv) to quit
  end run' - "${CURSOR_BUNDLE_ID}" >/dev/null 2>&1 || \
    osascript -e 'tell application "Cursor" to quit' >/dev/null 2>&1 || true
}

wait_cursor_quit() {
  local app="$1"
  local i=0
  while [[ "$i" -lt 30 ]]; do
    if ! cursor_is_running "$app"; then
      return 0
    fi
    i=$((i + 1))
    sleep "${CURSOR_ZH_POLL_SECONDS:-1}"
  done
  return 1
}

ensure_cursor_quit() {
  local app="$1"
  if ! cursor_is_running "$app"; then
    return 0
  fi
  if ! ui_confirm "Cursor 正在运行。要先退出才能继续。现在退出 Cursor 吗？

如果弹出保存提示，请先保存或处理完。" "退出并继续" "取消"; then
    ui_alert "已取消。你可以自己完全退出 Cursor 之后，再打开「Cursor 汉化」。"
    return 1
  fi
  while true; do
    quit_cursor_app "$app" || true
    if wait_cursor_quit "$app"; then
      return 0
    fi
    if ! ui_confirm "Cursor 还没有退出。如果它弹出了保存提示，请先处理完，再点「重试」。" "重试" "取消"; then
      ui_alert "已取消。请自己完全退出 Cursor 之后再试。"
      return 1
    fi
  done
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
  ensure_cursor_quit "$app" || return 1
  local status=0
  local blob=""
  run_cli_capture "$app" read status --json || status=$?
  if [[ "$status" -ne 0 ]]; then
    show_cli_error "没能读到 Cursor 的状态，所以没有安装。" "${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
    return 1
  fi
  if ! is_app_writable "$app"; then
    status=0
    if json_is_patched "$CLI_STDOUT"; then
      cursor_zh_log "已经有汉化，先恢复再安装。"
      run_privileged_cli "$app" restore apply || status=$?
    else
      run_privileged_cli "$app" apply || status=$?
    fi
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
      if [[ "${CLI_STEP:-}" == "restore" ]]; then
        show_cli_error "旧的汉化没能先去掉，所以没有继续安装。" "$blob"
      else
        show_cli_error "安装没有成功。" "$blob"
      fi
      return 1
    fi
  else
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

remove_watch_runtime() {
  local support=""
  support="$(support_dir)"
  rm -rf "${support}/runtime" || true
  rm -rf "${support}/watch.lock" || true
  rm -f "${support}/watch-notified" || true
}

remove_this_backup() {
  local app="$1"
  local support=""
  local key=""
  support="$(support_dir)"
  if ! key="$(cursor_install_key "$app")"; then
    cursor_zh_log "没能算出这份 Cursor 的备份编号，所以没有删除备份。"
    return 0
  fi
  case "$key" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
    *)
      cursor_zh_log "备份编号不像预期，所以没有删除备份。"
      return 0
      ;;
  esac
  rm -rf "${support}/backups/${key}" || true
}

file_sha256() {
  "$(resolve_node)" - "$1" <<'JS'
const crypto = require("crypto");
const fs = require("fs");
process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[2])).digest("hex"));
JS
}

product_field() {
  "$(resolve_node)" - "$1" "$2" <<'JS'
const fs = require("fs");
const product = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const value = product[process.argv[3]];
process.stdout.write(value == null ? "" : String(value));
JS
}

# True when the injection marker is gone and, when the original backup
# bytes are still on disk, the live files match those bytes.
restore_is_clean() {
  local app="$1"
  local resources="${app}/Contents/Resources/app"
  local html="${resources}/out/vs/code/electron-sandbox/workbench/workbench.html"
  local product="${resources}/product.json"
  if [[ -f "$html" ]] && grep -q 'cursor-zh-hans:start' "$html"; then
    return 1
  fi
  local support=""
  local key=""
  local version=""
  local commit=""
  local backed=""
  local live=""
  local rel=""
  local backed_hash=""
  local live_hash=""
  support="$(support_dir)"
  if ! key="$(cursor_install_key "$app")"; then
    return 0
  fi
  if [[ ! -f "$product" ]]; then
    return 0
  fi
  version="$(product_field "$product" version 2>/dev/null || true)"
  commit="$(product_field "$product" commit 2>/dev/null || true)"
  if [[ -z "$version" || -z "$commit" ]]; then
    return 0
  fi
  for rel in \
    "product.json" \
    "out/vs/code/electron-sandbox/workbench/workbench.html"
  do
    backed="${support}/backups/${key}/${version}+${commit}/files/${rel}"
    live="${resources}/${rel}"
    if [[ -f "$backed" && -f "$live" ]]; then
      backed_hash="$(file_sha256 "$backed")"
      live_hash="$(file_sha256 "$live")"
      if [[ -z "$backed_hash" || "$backed_hash" != "$live_hash" ]]; then
        return 1
      fi
    fi
  done
  return 0
}

clear_restore_suppress() {
  rm -f "$(support_dir)/suppress-watch"
}

# A watcher that already decided to apply must notice this file before it
# writes. Kill one that is still holding the lock so it cannot land after.
stop_inflight_watcher() {
  local app="$1"
  local self="$$"
  local parent="${PPID:-}"
  local pid=""
  local rest=""
  if ! command -v ps >/dev/null 2>&1; then
    return 0
  fi
  while read -r pid rest; do
    [[ -n "$pid" ]] || continue
    if [[ "$pid" == "$self" || "$pid" == "$parent" ]]; then
      continue
    fi
    case "$rest" in
      *watch.sh*"$app"*|*"$app"*watch.sh*)
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done < <(ps -ax -o pid=,command= 2>/dev/null || true)
}

wait_or_stop_watcher() {
  local app="$1"
  local support=""
  local lock=""
  local i=0
  local polls=30
  local now=""
  local mtime=""
  local age=0
  support="$(support_dir)"
  lock="${support}/watch.lock"
  if [[ ! -d "$lock" ]]; then
    return 0
  fi
  if [[ "${CURSOR_ZH_POLL_SECONDS:-1}" == 0 ]]; then
    polls=0
  fi
  while [[ -d "$lock" && "$i" -lt "$polls" ]]; do
    now="$(date +%s)"
    mtime="$(file_mtime "$lock" 2>/dev/null || printf '%s\n' "0")"
    age=$((now - mtime))
    if [[ "$age" -gt 1800 ]]; then
      break
    fi
    i=$((i + 1))
    sleep "${CURSOR_ZH_POLL_SECONDS:-1}"
  done
  if [[ -d "$lock" ]]; then
    stop_inflight_watcher "$app"
    rm -rf "$lock" || true
  fi
}

begin_restore_guard() {
  local support=""
  support="$(support_dir)"
  mkdir -p "$support"
  printf '%s\n' "restore" > "${support}/suppress-watch"
  remove_launch_agent || true
  wait_or_stop_watcher "$1" || true
  remove_watch_runtime || true
}

cmd_restore() {
  local app="$1"
  ensure_cursor_quit "$app" || return 1
  begin_restore_guard "$app"
  local status=0
  local mode="restore"
  local blob=""
  run_cli_capture "$app" auto restore || status=$?
  blob="${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
  if output_says_admin_cancelled "$blob"; then
    clear_restore_suppress
    ui_alert "已取消。没有输入管理员密码，所以 Cursor 本身没有改。

自动重新安装已经关掉。以后如果还要汉化，再点一次「安装汉化」。"
    return 1
  fi
  if [[ "$status" -ne 0 ]] && output_says_can_strip "$blob"; then
    if ui_confirm "上次恢复英文时，自动重新安装把汉化又写了回去，原始备份已经被删掉了。

界面上的注入可以去掉，并重新计算校验和。Glass 里如果做过静态替换，这一步没法还原。

要试着去掉注入、恢复成英文吗？" "去掉注入" "取消"; then
      status=0
      mode="rebuild"
      run_cli_capture "$app" auto restore --rebuild-without-backup || status=$?
      blob="${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
    fi
  fi
  if [[ "$status" -ne 0 ]]; then
    clear_restore_suppress
    if output_says_empty_entitlements "$blob"; then
      ui_warn "没有恢复成英文。自动重新安装已经关掉。

${ENTITLEMENTS_USER_MESSAGE}"
      return 1
    fi
    show_cli_error "没有恢复成英文。自动重新安装已经关掉，但界面没有恢复成英文。" "$blob"
    return 1
  fi
  if ! restore_is_clean "$app"; then
    status=0
    if [[ "$mode" == "rebuild" ]]; then
      run_cli_capture "$app" auto restore --rebuild-without-backup || status=$?
    else
      run_cli_capture "$app" auto restore || status=$?
    fi
    blob="${CLI_STDOUT}"$'\n'"${CLI_STDERR}"
    if [[ "$status" -ne 0 ]] || ! restore_is_clean "$app"; then
      clear_restore_suppress
      show_cli_error "没有恢复成英文。自动重新安装已经关掉，但界面没有恢复成英文。原始备份还留着。" "$blob"
      return 1
    fi
  fi
  remove_this_backup "$app" || true
  clear_restore_suppress
  if ui_confirm "要删掉安装日志吗？留着的话，以后出问题还能看。" "删掉日志" "留着"; then
    rm -f "$(cursor_zh_log_file)"
  fi
  relaunch_cursor "$app" || cursor_zh_log "重新打开 Cursor 没有成功。"
  ui_alert "已经恢复成英文，并关掉了自动重新安装。Cursor 正在打开。"
}

gui_main() {
  local preset="${1:-}"
  mkdir -p "$(dirname "$(cursor_zh_log_file)")"
  cursor_zh_log "启动 ${preset:-菜单}"
  if installer_must_move "${CURSOR_ZH_APP_ROOT:-}"; then
    explain_move_app
    cursor_zh_log "需要先把「Cursor 汉化」拖进「应用程序」。"
    return 1
  fi
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
