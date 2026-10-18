#!/bin/bash
# One-line Mac installer. No git and no Node.js required.
#   curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash -s -- --uninstall
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

CURSOR_ZH_REPO="${CURSOR_ZH_REPO:-Po1nt9/cursor-agents-zh-hans}"

print_help() {
  cat <<'EOF'
把 Cursor 智能体窗口改成简体中文（Mac）。

  curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/Po1nt9/cursor-agents-zh-hans/main/install.sh | bash -s -- --uninstall

会下载最新的安装包，放到你的「个人应用程序」文件夹（家里的 Applications），并打开「Cursor 汉化」。
不需要安装 git，也不需要安装 Node.js。
EOF
}

install_dest() {
  if [[ -n "${CURSOR_ZH_INSTALL_DEST:-}" ]]; then
    printf '%s\n' "$CURSOR_ZH_INSTALL_DEST"
    return 0
  fi
  printf '%s\n' "${HOME}/Applications"
}

download_release() {
  local dest="$1"
  local url="https://github.com/${CURSOR_ZH_REPO}/releases/latest/download/Cursor-zh-hans-macOS.zip"
  curl -fL --retry 3 --retry-delay 2 -o "$dest" "$url"
}

extract_zip() {
  local zip="$1"
  local dest="$2"
  mkdir -p "$dest"
  if command -v ditto >/dev/null 2>&1; then
    ditto -xk "$zip" "$dest"
    return 0
  fi
  unzip -q "$zip" -d "$dest"
}

open_installer() {
  local app="$1"
  shift
  if [[ "${CURSOR_ZH_DRY_RUN:-}" == 1 ]]; then
    if [[ -z "${CURSOR_ZH_LAUNCH_LOG:-}" ]]; then
      printf '%s\n' "测试模式缺少 CURSOR_ZH_LAUNCH_LOG" >&2
      return 1
    fi
    : > "$CURSOR_ZH_LAUNCH_LOG"
    printf '%s\n' "$app" >> "$CURSOR_ZH_LAUNCH_LOG"
    if [[ $# -gt 0 ]]; then
      printf '%s\n' "$*" >> "$CURSOR_ZH_LAUNCH_LOG"
    fi
    return 0
  fi
  if [[ $# -gt 0 ]]; then
    open "$app" --args "$@"
  else
    open "$app"
  fi
}

install_main() {
  local mode="open"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --uninstall|--restore)
        mode="uninstall"
        shift
        ;;
      --help|-h)
        print_help
        return 0
        ;;
      *)
        printf '%s\n' "不认识的参数：$1"
        print_help
        return 1
        ;;
    esac
  done

  local os_name=""
  os_name="$(uname -s)"
  if [[ "$os_name" != "Darwin" ]]; then
    printf '%s\n' "这一行命令只适用于 Mac。"
    printf '%s\n' "Windows 请看仓库里的 install.ps1。"
    printf '%s\n' "如果熟悉命令行，也可以用 node bin/cursor-zh.js。"
    return 1
  fi

  local dest=""
  local tmp=""
  local zip=""
  local unpacked=""
  local app=""
  dest="$(install_dest)"
  mkdir -p "$dest"
  tmp="$(mktemp -d)"
  zip="${tmp}/Cursor-zh-hans-macOS.zip"
  unpacked="${tmp}/unpack"
  printf '%s\n' "正在下载最新的 Cursor 汉化…"
  if ! download_release "$zip"; then
    printf '%s\n' "没有下载成功。请到 GitHub 的发布页手动下载 Cursor-zh-hans-macOS.zip。"
    rm -rf "$tmp"
    return 1
  fi
  printf '%s\n' "下载好了，正在解压…"
  if ! extract_zip "$zip" "$unpacked"; then
    printf '%s\n' "解压失败。请重新下载后再试。"
    rm -rf "$tmp"
    return 1
  fi
  app="${unpacked}/Cursor 汉化.app"
  if [[ ! -d "$app" ]]; then
    printf '%s\n' "压缩包里没有找到「Cursor 汉化」。"
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "${dest}/Cursor 汉化.app"
  mv "$app" "${dest}/Cursor 汉化.app"
  chmod +x "${dest}/Cursor 汉化.app/Contents/MacOS/launcher" 2>/dev/null || true
  chmod +x "${dest}/Cursor 汉化.app/Contents/Resources/node/arm64/node" 2>/dev/null || true
  chmod +x "${dest}/Cursor 汉化.app/Contents/Resources/node/x64/node" 2>/dev/null || true
  if command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine "${dest}/Cursor 汉化.app" 2>/dev/null || true
  fi
  rm -rf "$tmp"
  printf '%s\n' "已经放在：${dest}/Cursor 汉化.app"
  if [[ "$mode" == "uninstall" ]]; then
    printf '%s\n' "正在打开「Cursor 汉化」，接下来会恢复成英文。"
    open_installer "${dest}/Cursor 汉化.app" --restore
  else
    printf '%s\n' "正在打开「Cursor 汉化」。请在窗口里点「安装汉化」。"
    open_installer "${dest}/Cursor 汉化.app"
  fi
}

# curl | bash leaves BASH_SOURCE empty. A normal ./install.sh sets it equal to $0.
# Sourcing this file (tests) does neither of those, so it only defines functions.
if [[ "${CURSOR_ZH_LIB_ONLY:-}" == 1 ]]; then
  :
elif [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then
  install_main "$@"
fi
