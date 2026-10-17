import { execFileSync } from 'node:child_process';
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

export function invokingHome(env = process.env, fallback = os.homedir(), platform = process.platform, uid = currentUid()) {
  const user = env && env.SUDO_USER;
  if (
    uid === 0
    && platform !== 'win32'
    && user
    && user !== 'root'
    && /^[A-Za-z0-9._-]+$/.test(user)
  ) {
    return platform === 'darwin' ? `/Users/${user}` : `/home/${user}`;
  }
  return fallback;
}

function currentUid() {
  try {
    return typeof process.getuid === 'function' ? process.getuid() : null;
  } catch {
    return null;
  }
}

export function userDataDir(env = process.env) {
  const home = invokingHome(env);
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

export function macosApplicationCandidates(home = os.homedir(), readDir = fs.readdirSync) {
  const roots = ['/Applications', path.join(home, 'Applications')];
  const apps = [];
  for (const root of roots) {
    apps.push(path.join(root, 'Cursor.app', 'Contents', 'Resources', 'app'));
    let names = [];
    try {
      names = readDir(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name || name.startsWith('.') || name.endsWith('.app')) continue;
      apps.push(path.join(root, name, 'Cursor.app', 'Contents', 'Resources', 'app'));
    }
  }
  return apps;
}

export function cursorResourceFromCommand(command) {
  const text = String(command || '');
  if (!text) return null;
  const macRe = /(?:^|[\s"'])(\/.*?Cursor\.app)\/Contents\/MacOS\/Cursor(?=$|[\s"'])/g;
  let macMatch;
  let macPath = null;
  while ((macMatch = macRe.exec(text))) macPath = macMatch[1];
  if (macPath) return path.join(macPath, 'Contents', 'Resources', 'app');

  const linuxRe = /(?:^|[\s"'])(\/.*?resources\/app)(?=$|[\s"'/])/g;
  let linuxMatch;
  let linuxPath = null;
  while ((linuxMatch = linuxRe.exec(text))) {
    if (/cursor/i.test(linuxMatch[1])) linuxPath = linuxMatch[1];
  }
  return linuxPath;
}

function runningCursorCommands() {
  try {
    const output = execFileSync('ps', ['-ax', '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(output).split(/\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function candidateAppPaths() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return macosApplicationCandidates(home, fs.readdirSync);
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

export function detectAppPath(explicit, options = {}) {
  const isApp = options.isCursorApp ?? isCursorApp;
  if (explicit) {
    const normalized = normalizeAppPath(explicit);
    if (!isApp(normalized)) {
      throw new Error(`--app-path 不是 Cursor 安装目录（需要 product.json 与 workbench.html）: ${normalized}`);
    }
    return { appPath: normalized, searched: [normalized] };
  }
  const searched = [];
  const commands = options.commands ?? runningCursorCommands();
  for (const command of commands) {
    const fromProcess = cursorResourceFromCommand(command);
    if (fromProcess) searched.push(fromProcess);
  }
  searched.push(...candidateAppPaths());
  const unique = [];
  const seen = new Set();
  for (const candidate of searched) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }
  for (const candidate of unique) {
    if (isApp(candidate)) return { appPath: candidate, searched: unique };
  }
  throw new Error(
    `没有找到 Cursor 安装目录。已查找:\n${unique.map((item) => `  - ${item}`).join('\n')}\n请用 --app-path 指定 resources/app（macOS 也可直接传 Cursor.app，包括 /Applications/子目录/Cursor.app）。`,
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
