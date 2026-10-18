#!/usr/bin/env bash
# Plain-Chinese dialogs. All user-facing UI goes through osascript.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

ui_alert() {
  local message="$1"
  osascript -e 'on run argv
    display dialog (item 1 of argv) buttons {"好"} default button "好" with title "Cursor 汉化" with icon note
  end run' - "$message" >/dev/null || true
}

ui_warn() {
  local message="$1"
  osascript -e 'on run argv
    display dialog (item 1 of argv) buttons {"好"} default button "好" with title "Cursor 汉化" with icon caution
  end run' - "$message" >/dev/null || true
}

ui_confirm() {
  local message="$1"
  local yes="$2"
  local no="$3"
  local result=""
  result="$(osascript -e 'on run argv
    set theChoice to button returned of (display dialog (item 1 of argv) buttons {item 3 of argv, item 2 of argv} default button (item 2 of argv) with title "Cursor 汉化")
    return theChoice
  end run' - "$message" "$yes" "$no")" || return 1
  [[ "$result" == "$yes" ]]
}

ui_menu() {
  local message="$1"
  local result=""
  # choose from list has a real Cancel button. display dialog only allows three
  # buttons, so Esc could not leave that menu.
  result="$(osascript -e 'on run argv
    set theChoice to choose from list {"安装汉化", "恢复英文", "检查状态"} with prompt (item 1 of argv) with title "Cursor 汉化" default items {"安装汉化"} OK button name "好" cancel button name "取消"
    if theChoice is false then
      error number -128
    end if
    return item 1 of theChoice
  end run' - "$message")" || return 1
  case "$result" in
    ""|false|取消) return 1 ;;
  esac
  printf '%s\n' "$result"
}

ui_choose_file() {
  local prompt="$1"
  local chosen=""
  chosen="$(osascript -e 'on run argv
    set theFile to choose file with prompt (item 1 of argv) default location POSIX file "/Applications"
    return POSIX path of theFile
  end run' - "$prompt")" || return 1
  chosen="${chosen%/}"
  printf '%s\n' "$chosen"
}

ui_error_with_copy() {
  local summary="$1"
  local detail="$2"
  local result=""
  result="$(osascript -e 'on run argv
    set theChoice to button returned of (display dialog (item 1 of argv) buttons {"复制详细信息", "好"} default button "好" with title "Cursor 汉化" with icon caution)
    return theChoice
  end run' - "$summary")" || true
  if [[ "$result" == "复制详细信息" ]]; then
    osascript -e 'on run argv
      set the clipboard to (item 1 of argv)
    end run' - "$detail" >/dev/null || true
    ui_alert "详细信息已经复制。也可以打开日志文件查看。"
  fi
}

ui_ask_watch() {
  ui_confirm "Cursor 更新之后，界面可能会变回英文。要在更新后自动重新安装汉化吗？

选「要」的话，等 Cursor 不在运行时会自动装上，并给你一条通知。" "要，自动安装" "不用"
}

notify_user() {
  local message="$1"
  if [[ "${CURSOR_ZH_DRY_RUN:-}" == 1 ]]; then
    if [[ -n "${CURSOR_ZH_NOTIFY_LOG:-}" ]]; then
      printf '%s\n' "$message" >> "$CURSOR_ZH_NOTIFY_LOG"
    fi
    return 0
  fi
  osascript -e 'on run argv
    display notification (item 1 of argv) with title "Cursor 汉化"
  end run' - "$message" >/dev/null 2>&1 || true
}
