#!/bin/bash
# Double-click entry for 「Cursor 汉化」. Finder runs this with a short PATH.
# macOS ships bash 3.2. Keep this file compatible with that shell.
# shellcheck shell=bash
set -euo pipefail

if [[ -z "${CURSOR_ZH_KEEP_PATH:-}" ]]; then
  export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
fi

here="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "${here}/../Resources/scripts/gui.sh" ]]; then
  app_root="$(cd "${here}/../.." && pwd)"
  CURSOR_ZH_RESOURCES="$(cd "${here}/../Resources" && pwd)"
  export CURSOR_ZH_RESOURCES
  export CURSOR_ZH_PACK="${CURSOR_ZH_RESOURCES}/pack"
  export CURSOR_ZH_APP_ROOT="$app_root"
  # This fails silently when Gatekeeper has translocated the app onto a
  # read-only mount. gui_main then asks the user to move it.
  if command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine "$app_root" 2>/dev/null || true
  fi
  chmod +x "${CURSOR_ZH_RESOURCES}/node/arm64/node" "${CURSOR_ZH_RESOURCES}/node/x64/node" 2>/dev/null || true
  # shellcheck source=/dev/null
  source "${CURSOR_ZH_RESOURCES}/scripts/gui.sh"
else
  # shellcheck source=../lib/gui.sh
  source "${here}/../lib/gui.sh"
fi

if [[ -n "${CURSOR_ZH_TEST_HOOK:-}" ]]; then
  # shellcheck source=/dev/null
  source "$CURSOR_ZH_TEST_HOOK"
fi

if [[ "${CURSOR_ZH_LIB_ONLY:-}" == 1 ]]; then
  :
elif [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then
  gui_main "$@"
fi
