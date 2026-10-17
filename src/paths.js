import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REL_DESKTOP,
  REL_GLASS,
  REL_HTML,
  REL_PRODUCT,
  REL_SCRIPT,
  REL_STATE,
} from './version.js';

export function userDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(base, 'cursor-zh-hans');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'cursor-zh-hans');
  }
  const base = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(base, 'cursor-zh-hans');
}

export function candidateAppPaths() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return [
      '/Applications/Cursor.app/Contents/Resources/app',
      path.join(home, 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app'),
    ];
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    return [
      path.join(local, 'Programs', 'cursor', 'resources', 'app'),
      path.join(local, 'Programs', 'Cursor', 'resources', 'app'),
      path.join(programFiles, 'Cursor', 'resources', 'app'),
    ];
  }
  return [
    '/usr/share/cursor/resources/app',
    '/usr/lib/cursor/resources/app',
    '/opt/Cursor/resources/app',
    '/opt/cursor/resources/app',
    path.join(home, '.local', 'share', 'cursor', 'resources', 'app'),
  ];
}

export function normalizeAppPath(input) {
  const resolved = path.resolve(input);
  const suffixes = [
    path.join('Contents', 'Resources', 'app'),
    path.join('resources', 'app'),
  ];
  for (const suffix of suffixes) {
    const candidate = path.join(resolved, suffix);
    if (fs.existsSync(path.join(candidate, 'product.json'))) return candidate;
  }
  return resolved;
}

export function isCursorApp(appPath) {
  return fs.existsSync(path.join(appPath, 'product.json'))
    && fs.existsSync(path.join(appPath, REL_HTML));
}

export function detectAppPath(explicit) {
  if (explicit) {
    const normalized = normalizeAppPath(explicit);
    if (!isCursorApp(normalized)) {
      throw new Error(`--app-path 不是 Cursor 安装目录（需要 product.json 与 workbench.html）: ${normalized}`);
    }
    return { appPath: normalized, searched: [normalized] };
  }
  const searched = candidateAppPaths();
  for (const candidate of searched) {
    if (isCursorApp(candidate)) return { appPath: candidate, searched };
  }
  throw new Error(
    `没有找到 Cursor 安装目录。已查找:\n${searched.map((item) => `  - ${item}`).join('\n')}\n请用 --app-path 指定 resources/app（macOS 也可直接传 Cursor.app）。`,
  );
}

export function appFiles(appPath) {
  return {
    root: appPath,
    product: path.join(appPath, REL_PRODUCT),
    html: path.join(appPath, REL_HTML),
    script: path.join(appPath, REL_SCRIPT),
    glass: path.join(appPath, REL_GLASS),
    desktop: path.join(appPath, REL_DESKTOP),
    state: path.join(appPath, REL_STATE),
  };
}

export function macBundlePath(appPath) {
  const normalized = path.resolve(appPath);
  const marker = `${path.sep}Contents${path.sep}Resources${path.sep}app`;
  if (normalized.endsWith(marker)) {
    return normalized.slice(0, -marker.length);
  }
  return null;
}
