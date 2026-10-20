#!/usr/bin/env bash
# Find Cursor.app via Spotlight plus the usual Applications folders.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

# Stable Cursor bundle id (ToDesktop). Spotlight query uses this.
CURSOR_BUNDLE_ID="com.todesktop.230313mzl4w4u92"

cursor_bundle_id() {
  printf '%s\n' "$CURSOR_BUNDLE_ID"
}

cursor_app_is_valid() {
  local app="$1"
  [[ -n "$app" ]] || return 1
  [[ -f "$app/Contents/Resources/app/product.json" ]] || return 1
  [[ -f "$app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html" ]] || return 1
  return 0
}

# Pull "/any/path/Cursor.app" out of a process command line.
cursor_app_from_command() {
  local line="$1"
  local marker="Cursor.app/Contents/MacOS/Cursor"
  case "$line" in
    *"$marker"*) ;;
    *) return 1 ;;
  esac
  local head="${line%%"${marker}"*}"
  local path="${head}Cursor.app"
  case "$path" in
    *\"*) path="${path##*\"}" ;;
  esac
  case "$path" in
    *\'*) path="${path##*\'}" ;;
  esac
  case "$path" in
    /*) ;;
    */*) path="/${path#*/}" ;;
    *) return 1 ;;
  esac
  case "$path" in
    *.app) printf '%s\n' "$path" ;;
    *) return 1 ;;
  esac
}

cursor_search_roots() {
  local roots="/Applications"
  if [[ -n "${HOME:-}" ]]; then
    roots="${roots}:${HOME}/Applications"
  fi
  if [[ -n "${CURSOR_ZH_SEARCH_ROOTS:-}" ]]; then
    roots="${CURSOR_ZH_SEARCH_ROOTS}"
  fi
  local rest="$roots"
  local part=""
  while [[ -n "$rest" ]]; do
    part="${rest%%:*}"
    if [[ "$rest" == *:* ]]; then
      rest="${rest#*:}"
    else
      rest=""
    fi
    if [[ -n "$part" ]]; then
      printf '%s\n' "$part"
    fi
  done
}

append_line() {
  local current="$1"
  local extra="$2"
  if [[ -z "$current" ]]; then
    printf '%s' "$extra"
  else
    printf '%s\n%s' "$current" "$extra"
  fi
}

find_cursor_apps() {
  local found=""
  local line=""
  if command -v mdfind >/dev/null 2>&1; then
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      line="${line%/}"
      found="$(append_line "$found" "$line")"
    done < <(mdfind "kMDItemCFBundleIdentifier == '${CURSOR_BUNDLE_ID}'" 2>/dev/null || true)
  fi

  local root=""
  local child=""
  local base=""
  while IFS= read -r root; do
    [[ -n "$root" ]] || continue
    found="$(append_line "$found" "${root}/Cursor.app")"
    if [[ -d "$root" ]]; then
      for child in "$root"/*; do
        [[ -e "$child" ]] || continue
        [[ -d "$child" ]] || continue
        base="$(basename "$child")"
        case "$base" in
          .*) continue ;;
          *.app) continue ;;
        esac
        found="$(append_line "$found" "${child}/Cursor.app")"
      done
    fi
  done < <(cursor_search_roots)

  if command -v ps >/dev/null 2>&1; then
    local ps_line=""
    local from_ps=""
    while IFS= read -r ps_line; do
      from_ps="$(cursor_app_from_command "$ps_line" 2>/dev/null || true)"
      if [[ -n "$from_ps" ]]; then
        found="$(append_line "$found" "$from_ps")"
      fi
    done < <(ps -ax -o command= 2>/dev/null || true)
  fi

  local seen_file=""
  seen_file="$(mktemp)"
  local item=""
  while IFS= read -r item; do
    [[ -n "$item" ]] || continue
    item="${item%/}"
    cursor_app_is_valid "$item" || continue
    if grep -Fxq -- "$item" "$seen_file" 2>/dev/null; then
      continue
    fi
    printf '%s\n' "$item" >> "$seen_file"
    printf '%s\n' "$item"
  done <<< "$found"
  rm -f "$seen_file"
}
