import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellScripts = [
  'install.sh',
  'packaging/macos/launcher.sh',
  'packaging/macos/build-app.sh',
  'packaging/lib/common.sh',
  'packaging/lib/find-cursor.sh',
  'packaging/lib/dialogs.sh',
  'packaging/lib/launchagent.sh',
  'packaging/lib/watch.sh',
  'packaging/lib/gui.sh',
];

function runBash(body, env = {}) {
  const result = spawnSync('bash', ['--noprofile', '--norc', '-c', body], {
    encoding: 'utf8',
    cwd: root,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: env.HOME || os.homedir(),
      TMPDIR: env.TMPDIR || os.tmpdir(),
      LANG: 'C.UTF-8',
      ...env,
    },
  });
  return result;
}

function writeExec(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o755);
}

function makeCursor(parent, folderName = 'Cursor.app') {
  const app = path.join(parent, folderName);
  const resources = path.join(app, 'Contents', 'Resources', 'app');
  const html = path.join(resources, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html');
  fs.mkdirSync(path.dirname(html), { recursive: true });
  fs.writeFileSync(html, '<html></html>\n');
  fs.writeFileSync(path.join(resources, 'product.json'), `${JSON.stringify({
    version: '9.9.9',
    commit: 'abc123',
  }, null, 2)}\n`);
  return app;
}

function fakePack(dir) {
  const file = path.join(dir, 'bin', 'cursor-zh.js');
  writeExec(file, `'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(args) + '\\n');
const cmd = args[0];
if (cmd === 'status') {
  process.stdout.write(process.env.MOCK_STATUS_JSON || '{}');
  process.exit(0);
}
if (cmd === 'apply') {
  if (process.env.MOCK_APPLY_OUTPUT) process.stdout.write(process.env.MOCK_APPLY_OUTPUT);
  process.exit(Number(process.env.MOCK_APPLY_CODE || 0));
}
if (cmd === 'restore') {
  if (process.env.MOCK_RESTORE_OUTPUT) process.stdout.write(process.env.MOCK_RESTORE_OUTPUT);
  process.exit(Number(process.env.MOCK_RESTORE_CODE || 0));
}
process.stderr.write('unknown ' + cmd);
process.exit(1);
`);
  return dir;
}

function statusJson(extra = {}) {
  return JSON.stringify({
    files: { injected: false, staticMarker: false },
    state: null,
    entitlements: { missing: false },
    product: { version: '9.9.9', commit: 'abc123' },
    bundlePath: extra.bundlePath || '/Applications/Cursor.app',
    appPath: '/Applications/Cursor.app/Contents/Resources/app',
    running: { running: false },
    writable: true,
    ...extra,
  });
}

function flowEnv(dir, extra = {}) {
  const home = path.join(dir, 'home');
  const mockUi = path.join(dir, 'ui.log');
  const mockLog = path.join(dir, 'cli.log');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(mockUi, '');
  fs.writeFileSync(mockLog, '');
  return {
    HOME: home,
    MOCK_UI: mockUi,
    MOCK_LOG: mockLog,
    CURSOR_ZH_LOG_FILE: path.join(dir, 'cursor-zh-hans.log'),
    CURSOR_ZH_NODE: process.execPath,
    CURSOR_ZH_PACK: fakePack(path.join(dir, 'pack')),
    CURSOR_ZH_SKIP_LAUNCHCTL: '1',
    CURSOR_ZH_POLL_SECONDS: '0',
    CURSOR_ZH_WATCH_SCRIPT: path.join(root, 'packaging/lib/watch.sh'),
    MOCK_STATUS_JSON: statusJson(),
    ...extra,
  };
}

const flowOverrides = `
cursor_is_running() { return 1; }
ui_alert() { printf 'ALERT %s\\n' "$1" >> "$MOCK_UI"; }
ui_warn() { printf 'WARN %s\\n' "$1" >> "$MOCK_UI"; }
ui_confirm() { printf 'CONFIRM %s\\n' "$1" >> "$MOCK_UI"; return 0; }
ui_menu() { printf 'MENU\\n' >> "$MOCK_UI"; printf '%s\\n' "安装汉化"; }
ui_choose_file() { printf 'CHOOSE %s\\n' "$1" >> "$MOCK_UI"; printf '%s\\n' "\${MOCK_CHOSEN:-}"; }
ui_error_with_copy() { printf 'ERROR %s\\n' "$1" >> "$MOCK_UI"; printf 'DETAIL %s\\n' "$2" >> "$MOCK_UI"; }
ui_ask_watch() { printf 'ASKWATCH\\n' >> "$MOCK_UI"; return 0; }
relaunch_cursor() { printf 'RELAUNCH %s\\n' "$1" >> "$MOCK_UI"; }
quit_cursor_app() { printf 'QUIT\\n' >> "$MOCK_UI"; }
`;

function sourceGui(dir, body, env = {}) {
  const merged = flowEnv(dir, env);
  const script = `
source ${JSON.stringify(path.join(root, 'packaging/lib/gui.sh'))}
${flowOverrides}
${body}
`;
  return { result: runBash(script, merged), env: merged };
}

function readUi(env) {
  return fs.readFileSync(env.MOCK_UI, 'utf8');
}

function cliArgs(env) {
  return fs.readFileSync(env.MOCK_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('shellcheck is clean and scripts stay on bash 3.2', (t) => {
  const which = spawnSync('bash', ['-c', 'command -v shellcheck'], { encoding: 'utf8' });
  if (which.status !== 0 || !which.stdout.trim()) {
    t.diagnostic('shellcheck is not installed; skipping the shellcheck pass');
  } else {
    const result = spawnSync('shellcheck', ['-x', '-P', 'SCRIPTDIR', ...shellScripts], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }
  const banned = [
    [/declare -A/, 'associative array'],
    [/\bmapfile\b/, 'mapfile'],
    [/\breadarray\b/, 'readarray'],
    [/\$\{[A-Za-z_][A-Za-z0-9_]*(\[[^\]]+\])?,,/, 'lowercase expansion'],
    [/\$\{[A-Za-z_][A-Za-z0-9_]*(\[[^\]]+\])?\^\^/, 'uppercase expansion'],
  ];
  for (const file of shellScripts) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [pattern, label] of banned) {
      assert.equal(pattern.test(text), false, `${file} uses ${label}`);
    }
    const syntax = spawnSync('bash', ['-n', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, `${file}\n${syntax.stderr}`);
  }
});

test('Spotlight, common folders, and the process list find Cursor.app', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-find-'));
  const rootA = path.join(dir, 'Applications');
  const homeApps = path.join(dir, 'home-apps');
  fs.mkdirSync(rootA);
  fs.mkdirSync(homeApps);
  const standard = makeCursor(rootA);
  const nested = makeCursor(path.join(rootA, 'Agent'));
  makeCursor(path.join(rootA, 'Safari.app'));
  fs.mkdirSync(path.join(rootA, '.hidden'));
  makeCursor(path.join(rootA, '.hidden'));
  const broken = path.join(rootA, 'Broken', 'Cursor.app');
  fs.mkdirSync(broken, { recursive: true });
  const elsewhere = makeCursor(path.join(dir, 'custom'));
  const mockBin = path.join(dir, 'bin');
  const mdfindFile = path.join(dir, 'mdfind.txt');
  fs.writeFileSync(mdfindFile, `${standard}\n`);
  writeExec(path.join(mockBin, 'mdfind'), `#!/bin/bash
printf '%s\\n' "$*" > ${JSON.stringify(path.join(dir, 'mdfind.args'))}
cat ${JSON.stringify(mdfindFile)}
`);
  writeExec(path.join(mockBin, 'ps'), `#!/bin/bash
printf '%s\\n' ${JSON.stringify(`${elsewhere}/Contents/MacOS/Cursor --flag`)}
`);
  const body = `
source ${JSON.stringify(path.join(root, 'packaging/lib/find-cursor.sh'))}
find_cursor_apps
`;
  const result = runBash(body, {
    HOME: path.join(dir, 'home'),
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_SEARCH_ROOTS: `${rootA}:${homeApps}`,
    TMPDIR: dir,
  });
  assert.equal(result.status, 0, result.stderr);
  const found = result.stdout.trim().split('\n');
  assert.deepEqual(found, [standard, nested, elsewhere]);
  const query = fs.readFileSync(path.join(dir, 'mdfind.args'), 'utf8');
  assert.match(query, /kMDItemCFBundleIdentifier/);
  assert.match(query, /com\.todesktop\.230313mzl4w4u92/);
  assert.equal(found.includes(path.join(rootA, 'Safari.app', 'Cursor.app')), false);
  assert.equal(found.includes(broken), false);
});

test('a command line can point at Cursor.app, including spaces', () => {
  const samples = [
    ['/Applications/Agent/Cursor.app/Contents/MacOS/Cursor', '/Applications/Agent/Cursor.app'],
    ['/Applications/My Apps/Cursor.app/Contents/MacOS/Cursor --flag', '/Applications/My Apps/Cursor.app'],
    ['"/Applications/My Apps/Cursor.app/Contents/MacOS/Cursor"', '/Applications/My Apps/Cursor.app'],
    ['123 /Applications/Agent/Cursor.app/Contents/MacOS/Cursor --x', '/Applications/Agent/Cursor.app'],
  ];
  for (const [input, expected] of samples) {
    const direct = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/find-cursor.sh'))}
cursor_app_from_command ${JSON.stringify(input)}
`, { HOME: os.tmpdir() });
    assert.equal(direct.status, 0, direct.stderr);
    assert.equal(direct.stdout.trim(), expected);
  }
  const miss = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/find-cursor.sh'))}
cursor_app_from_command cursor || printf '%s\\n' missing
`, { HOME: os.tmpdir() });
  assert.match(miss.stdout, /missing/);
});

test('one Cursor is used as-is; several or none ask for a file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-pick-'));
  const only = makeCursor(path.join(dir, 'only'));
  const first = makeCursor(path.join(dir, 'a'));
  const second = makeCursor(path.join(dir, 'b'));
  const chosen = makeCursor(path.join(dir, 'chosen'));

  const one = sourceGui(dir, `resolve_target_app ${JSON.stringify(only)}`, { MOCK_CHOSEN: chosen });
  assert.equal(one.result.status, 0, one.result.stderr);
  assert.equal(one.result.stdout.trim(), only);
  assert.equal(readUi(one.env).includes('CHOOSE'), false);

  const many = sourceGui(path.join(dir, 'many'), `
apps=$(printf '%s\\n' ${JSON.stringify(first)} ${JSON.stringify(second)})
resolve_target_app "$apps"
`, { MOCK_CHOSEN: chosen });
  assert.equal(many.result.stdout.trim(), chosen);
  assert.match(readUi(many.env), /好几个/);

  const none = sourceGui(path.join(dir, 'none'), 'resolve_target_app ""', { MOCK_CHOSEN: chosen });
  assert.equal(none.result.stdout.trim(), chosen);
  assert.match(readUi(none.env), /没有自动找到/);

  const retryLog = path.join(dir, 'tries');
  fs.writeFileSync(retryLog, '0');
  const retryRun = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/gui.sh'))}
${flowOverrides}
ui_choose_file() {
  n=$(cat ${JSON.stringify(retryLog)})
  n=$((n + 1))
  printf '%s\\n' "$n" > ${JSON.stringify(retryLog)}
  if [[ "$n" -eq 1 ]]; then printf '%s\\n' "/tmp/not-cursor"; return 0; fi
  printf '%s\\n' ${JSON.stringify(chosen)}
}
resolve_target_app ""
`, flowEnv(path.join(dir, 'retry-env')));
  assert.equal(retryRun.status, 0, retryRun.stderr);
  assert.equal(retryRun.stdout.trim(), chosen);
});

test('bundled node follows uname and is not replaced by a system node', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-node-'));
  const resources = path.join(dir, 'Resources');
  const arm = path.join(resources, 'node', 'arm64', 'node');
  const x64 = path.join(resources, 'node', 'x64', 'node');
  writeExec(arm, '#!/bin/sh\n');
  writeExec(x64, '#!/bin/sh\n');
  const mockBin = path.join(dir, 'bin');
  writeExec(path.join(mockBin, 'uname'), `#!/bin/bash
if [[ "\${1:-}" == "-m" ]]; then printf '%s\\n' "$MOCK_UNAME_M"; exit 0; fi
printf '%s\\n' Linux
`);
  writeExec(path.join(mockBin, 'node'), '#!/bin/bash\nprintf system-node\\n');
  const body = `
source ${JSON.stringify(path.join(root, 'packaging/lib/common.sh'))}
node_arch_for arm64
node_arch_for aarch64
node_arch_for x86_64
node_arch_for amd64
resolve_node
`;
  const armResult = runBash(body, {
    HOME: dir,
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_RESOURCES: resources,
    MOCK_UNAME_M: 'arm64',
  });
  assert.equal(armResult.status, 0, armResult.stderr);
  const lines = armResult.stdout.trim().split('\n');
  assert.deepEqual(lines.slice(0, 4), ['arm64', 'arm64', 'x64', 'x64']);
  assert.equal(lines[4], arm);

  const intel = runBash('source ' + JSON.stringify(path.join(root, 'packaging/lib/common.sh')) + '\nresolve_node\n', {
    HOME: dir,
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_RESOURCES: resources,
    MOCK_UNAME_M: 'x86_64',
  });
  assert.equal(intel.stdout.trim(), x64);

  fs.rmSync(arm);
  const missing = runBash('source ' + JSON.stringify(path.join(root, 'packaging/lib/common.sh')) + '\nresolve_node\n', {
    HOME: dir,
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_RESOURCES: resources,
    MOCK_UNAME_M: 'arm64',
  });
  assert.notEqual(missing.status, 0);
  assert.equal(missing.stdout.includes('system-node'), false);
});

test('install restores an old patch, then applies without sudo when the app is writable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-install-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const { result, env } = sourceGui(dir, `cmd_install ${JSON.stringify(app)}`, {
    MOCK_STATUS_JSON: statusJson({
      files: { injected: true, staticMarker: false },
      state: { cursorVersion: '9.9.9', cursorCommit: 'abc123' },
      bundlePath: app,
    }),
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const calls = cliArgs(env);
  assert.deepEqual(calls.map((args) => args[0]), ['status', 'restore', 'apply']);
  const apply = calls[2];
  assert.ok(apply.includes('--update-checksums'));
  assert.ok(apply.includes('--no-sudo'));
  assert.ok(apply.includes('--app-path'));
  assert.ok(apply.includes(app));
  assert.equal(apply.includes('--static'), false);
  const ui = readUi(env);
  assert.match(ui, /ASKWATCH/);
  assert.match(ui, /RELAUNCH/);
  assert.match(ui, /Cursor Safe Storage/);
  assert.match(ui, /始终允许/);
  const plist = path.join(env.HOME, 'Library', 'LaunchAgents', 'com.po1nt9.cursor-zh-hans.watch.plist');
  const text = fs.readFileSync(plist, 'utf8');
  assert.match(text, /com\.po1nt9\.cursor-zh-hans\.watch/);
  assert.match(text, /WatchPaths/);
  assert.match(text, /product\.json/);
  assert.ok(text.includes(app));
  const runtime = path.join(env.HOME, 'Library', 'Application Support', 'cursor-zh-hans', 'runtime');
  const stagedNode = path.join(runtime, 'node', 'node');
  const stagedWatch = path.join(runtime, 'scripts', 'watch.sh');
  const stagedPack = path.join(runtime, 'pack');
  assert.ok(text.includes(stagedNode));
  assert.ok(text.includes(stagedWatch));
  assert.ok(text.includes(stagedPack));
  assert.equal(text.includes(env.CURSOR_ZH_NODE), false);
  assert.equal(text.includes(env.CURSOR_ZH_WATCH_SCRIPT), false);
  assert.equal(text.includes(env.CURSOR_ZH_PACK), false);
  assert.equal(fs.existsSync(path.join(runtime, 'scripts', 'common.sh')), true);
  assert.equal(fs.existsSync(path.join(runtime, 'scripts', 'dialogs.sh')), true);
  assert.equal(fs.existsSync(path.join(stagedPack, 'bin', 'cursor-zh.js')), true);
  assert.equal(fs.readFileSync(path.join(runtime, 'version'), 'utf8').trim().length > 0, true);
  assert.equal(fs.statSync(stagedNode).mode & 0o111, 0o111);
});

test('a clean install does not restore first and can skip the watcher', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-clean-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const { result, env } = sourceGui(dir, `
ui_ask_watch() { printf 'ASKWATCH no\\n' >> "$MOCK_UI"; return 1; }
cmd_install ${JSON.stringify(app)}
`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(cliArgs(env).map((args) => args[0]), ['status', 'apply']);
  const plist = path.join(env.HOME, 'Library', 'LaunchAgents', 'com.po1nt9.cursor-zh-hans.watch.plist');
  assert.equal(fs.existsSync(plist), false);
});

test('an unwritable app asks for an administrator password and does not call sudo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-admin-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const saved = path.join(dir, 'elevated.sh');
  const { result, env } = sourceGui(dir, `
is_app_writable() { return 1; }
run_elevated() {
  printf '%s\\n' "$*" >> ${JSON.stringify(path.join(dir, 'elevated.args'))}
  printf '%s\\n' "已处理 Cursor 9.9.9 (abc123)"
  return 0
}
cmd_install ${JSON.stringify(app)}
`, { MOCK_STATUS_JSON: statusJson({ writable: false, bundlePath: app }) });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const calls = cliArgs(env).map((args) => args[0]);
  assert.deepEqual(calls, ['status']);
  const elevated = fs.readFileSync(path.join(dir, 'elevated.args'), 'utf8');
  assert.match(elevated, /apply/);
  assert.match(elevated, /--update-checksums/);
  assert.match(elevated, /--no-sudo/);
  assert.equal(elevated.includes(' sudo '), false);
  assert.equal(fs.existsSync(saved), false);
});

test('the administrator dialog is osascript and keeps the invoking user', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-osa-'));
  const mockBin = path.join(dir, 'bin');
  const saved = path.join(dir, 'saved.sh');
  writeExec(path.join(mockBin, 'osascript'), `#!/bin/bash
printf '%s\\n' "$*" >> ${JSON.stringify(path.join(dir, 'osa.log'))}
last=""
for a in "$@"; do last="$a"; done
case "$last" in
  /bin/bash\\ *)
    script="\${last#/bin/bash }"
    cp "$script" ${JSON.stringify(saved)}
    /bin/bash "$script"
    ;;
esac
`);
  const result = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/gui.sh'))}
run_elevated /bin/echo hello-from-root
`, {
    HOME: path.join(dir, 'home'),
    PATH: `${mockBin}:/usr/bin:/bin`,
    TMPDIR: dir,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /hello-from-root/);
  const osa = fs.readFileSync(path.join(dir, 'osa.log'), 'utf8');
  assert.match(osa, /with administrator privileges/);
  const script = fs.readFileSync(saved, 'utf8');
  assert.match(script, /SUDO_USER=/);
  assert.match(script, /SUDO_UID=/);
  assert.match(script, /SUDO_GID=/);
  assert.doesNotMatch(script, /\bsudo\b/);
});

test('Cursor must quit before install, and a refusal stops there', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-quit-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const refused = sourceGui(dir, `
cursor_is_running() { return 0; }
ui_confirm() { printf 'CONFIRM %s\\n' "$1" >> "$MOCK_UI"; return 1; }
cmd_install ${JSON.stringify(app)}
`);
  assert.notEqual(refused.result.status, 0);
  assert.equal(cliArgs(refused.env).length, 0);
  assert.match(readUi(refused.env), /已取消/);

  const marker = path.join(dir, 'ran');
  const accepted = sourceGui(path.join(dir, 'yes'), `
cursor_is_running() {
  if [[ ! -f ${JSON.stringify(marker)} ]]; then
    touch ${JSON.stringify(marker)}
    return 0
  fi
  return 1
}
ui_confirm() { return 0; }
cmd_install ${JSON.stringify(app)}
`);
  assert.equal(accepted.result.status, 0, accepted.result.stderr);
  assert.match(readUi(accepted.env), /QUIT/);
  assert.ok(cliArgs(accepted.env).some((args) => args[0] === 'apply'));
});

test('empty entitlements tell the user to reinstall Cursor from cursor.com', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-ent-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const failed = sourceGui(dir, `cmd_install ${JSON.stringify(app)}`, {
    MOCK_APPLY_CODE: '1',
    MOCK_APPLY_OUTPUT: 'macOS 重签名没有留下 entitlements，或 codesign 没有成功。\n界面文件已按备份还原。\n',
  });
  assert.notEqual(failed.result.status, 0);
  const ui = readUi(failed.env);
  assert.match(ui, /cursor\.com/);
  assert.match(ui, /重新下载并安装 Cursor/);
  assert.doesNotMatch(ui, /RELAUNCH/);
  assert.match(fs.readFileSync(failed.env.CURSOR_ZH_LOG_FILE, 'utf8'), /entitlements/);

  const doctor = sourceGui(path.join(dir, 'status'), `cmd_status ${JSON.stringify(app)}`, {
    MOCK_STATUS_JSON: statusJson({
      entitlements: { missing: true, reason: 'empty' },
      bundlePath: app,
    }),
  });
  assert.equal(doctor.result.status, 0, doctor.result.stderr);
  assert.match(readUi(doctor.env), /cursor\.com/);
  assert.match(readUi(doctor.env), /重装 Cursor 本身/);
});

test('other failures offer the log and the copied detail', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-err-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const { result, env } = sourceGui(dir, `cmd_install ${JSON.stringify(app)}`, {
    MOCK_APPLY_CODE: '1',
    MOCK_APPLY_OUTPUT: '磁盘满了，写不进去。',
  });
  assert.notEqual(result.status, 0);
  const ui = readUi(env);
  assert.match(ui, /安装没有成功/);
  assert.match(ui, /cursor-zh-hans\.log/);
  assert.match(ui, /磁盘满了/);
  assert.match(fs.readFileSync(env.CURSOR_ZH_LOG_FILE, 'utf8'), /磁盘满了/);
});

test('restore removes the LaunchAgent unless the password dialog was cancelled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-restore-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const installed = sourceGui(dir, `cmd_install ${JSON.stringify(app)}`);
  assert.equal(installed.result.status, 0, installed.result.stderr);
  const plist = path.join(installed.env.HOME, 'Library', 'LaunchAgents', 'com.po1nt9.cursor-zh-hans.watch.plist');
  assert.equal(fs.existsSync(plist), true);

  const restored = sourceGui(dir, `cmd_restore ${JSON.stringify(app)}`, {
    HOME: installed.env.HOME,
    MOCK_UI: installed.env.MOCK_UI,
    MOCK_LOG: path.join(dir, 'restore-cli.log'),
    CURSOR_ZH_LOG_FILE: installed.env.CURSOR_ZH_LOG_FILE,
    CURSOR_ZH_PACK: installed.env.CURSOR_ZH_PACK,
  });
  fs.writeFileSync(restored.env.MOCK_LOG, '');
  assert.equal(restored.result.status, 0, restored.result.stderr);
  assert.equal(fs.existsSync(plist), false);
  assert.match(readUi(restored.env), /已经恢复成英文/);

  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.writeFileSync(plist, '<plist></plist>');
  const cancelled = sourceGui(path.join(dir, 'cancel'), `
cmd_restore ${JSON.stringify(app)}
`, {
    HOME: installed.env.HOME,
    MOCK_RESTORE_CODE: '1',
    MOCK_RESTORE_OUTPUT: 'User canceled. (-128)',
  });
  assert.notEqual(cancelled.result.status, 0);
  assert.equal(fs.existsSync(plist), true);
  assert.match(readUi(cancelled.env), /管理员密码/);
});

test('dialogs copy the detail and the menu uses the three Chinese actions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-dialog-'));
  const mockBin = path.join(dir, 'bin');
  const clipboard = path.join(dir, 'clipboard.txt');
  writeExec(path.join(mockBin, 'osascript'), `#!/bin/bash
printf '%s\\n' "$*" >> ${JSON.stringify(path.join(dir, 'osa.log'))}
joined="$*"
if [[ "$joined" == *clipboard* ]]; then
  last=""
  for a in "$@"; do last="$a"; done
  printf '%s\\n' "$last" > ${JSON.stringify(clipboard)}
  exit 0
fi
if [[ "$joined" == *"要，自动安装"* ]]; then
  printf '%s\\n' "要，自动安装"
  exit 0
fi
if [[ "$joined" == *"检查状态"* ]]; then
  printf '%s\\n' "安装汉化"
  exit 0
fi
if [[ "$joined" == *"复制详细信息"* ]]; then
  printf '%s\\n' "复制详细信息"
  exit 0
fi
exit 0
`);
  const result = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/dialogs.sh'))}
ui_error_with_copy "安装没有成功。" "详细原因在这里"
choice=$(ui_menu "请选择")
printf '%s\\n' "MENU:$choice"
ui_ask_watch
`, {
    HOME: path.join(dir, 'home'),
    PATH: `${mockBin}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.readFileSync(clipboard, 'utf8').trim(), '详细原因在这里');
  assert.match(result.stdout, /MENU:安装汉化/);
  const osa = fs.readFileSync(path.join(dir, 'osa.log'), 'utf8');
  assert.match(osa, /检查状态/);
  assert.match(osa, /恢复英文/);
  assert.match(osa, /安装汉化/);
  assert.match(osa, /choose from list/);
  assert.match(osa, /取消/);
});

test('the watcher reapplies only when the install is stale and Cursor is quit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-watch-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const resources = path.join(app, 'Contents', 'Resources', 'app');
  const product = {
    version: '2.0.0',
    commit: 'fff',
  };
  fs.writeFileSync(path.join(resources, 'product.json'), `${JSON.stringify(product)}\n`);
  const htmlPath = path.join(resources, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html');
  const notify = path.join(dir, 'notify.log');
  const pack = fakePack(path.join(dir, 'pack'));
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });

  function decide(label, mutate) {
    mutate();
    const result = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/watch.sh'))}
cursor_is_running() { return ${label === 'wait' ? 0 : 1}; }
if [[ ${JSON.stringify(label)} == unwritable ]]; then
  is_app_writable() { return 1; }
fi
watch_decide ${JSON.stringify(app)}
`, {
      HOME: home,
      CURSOR_ZH_NODE: process.execPath,
      CURSOR_ZH_PACK: pack,
      CURSOR_ZH_DRY_RUN: '1',
      CURSOR_ZH_NOTIFY_LOG: notify,
      CURSOR_ZH_LOG_FILE: path.join(dir, 'watch.log'),
    });
    assert.equal(result.status, 0, `${label}\n${result.stderr}`);
    return result.stdout.trim();
  }

  fs.writeFileSync(htmlPath, '<html></html>\n');
  assert.equal(decide('apply', () => {}), 'apply');
  assert.equal(decide('wait', () => {}), 'wait');
  assert.equal(decide('unwritable', () => {}), 'unwritable');
  fs.writeFileSync(htmlPath, '<html>cursor-zh-hans:start</html>\n');
  fs.mkdirSync(path.join(resources, '.cursor-zh-hans'), { recursive: true });
  fs.writeFileSync(path.join(resources, '.cursor-zh-hans', 'state.json'), `${JSON.stringify({
    cursorVersion: '2.0.0',
    cursorCommit: 'fff',
  })}\n`);
  assert.equal(decide('skip', () => {}), 'skip');
  fs.writeFileSync(path.join(resources, '.cursor-zh-hans', 'state.json'), `${JSON.stringify({
    cursorVersion: '1.0.0',
    cursorCommit: 'old',
  })}\n`);
  assert.equal(decide('manual', () => {}), 'manual');

  fs.writeFileSync(htmlPath, '<html></html>\n');
  const mockLog = path.join(dir, 'watch-cli.log');
  fs.writeFileSync(mockLog, '');
  fs.writeFileSync(notify, '');
  const patchingPack = path.join(dir, 'patch-pack');
  writeExec(path.join(patchingPack, 'bin', 'cursor-zh.js'), `'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(args) + '\\n');
if (args[0] !== 'apply') process.exit(0);
const appFlag = args[args.indexOf('--app-path') + 1];
const root = appFlag + '/Contents/Resources/app';
const html = root + '/out/vs/code/electron-sandbox/workbench/workbench.html';
fs.writeFileSync(html, '<html>cursor-zh-hans:start</html>\\n');
fs.mkdirSync(root + '/.cursor-zh-hans', { recursive: true });
fs.writeFileSync(root + '/.cursor-zh-hans/state.json', JSON.stringify({
  cursorVersion: '2.0.0',
  cursorCommit: 'fff',
}) + '\\n');
process.stdout.write('已处理');
`);
  const applied = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/watch.sh'))}
cursor_is_running() { return 1; }
watch_main --cursor-app ${JSON.stringify(app)} --node ${JSON.stringify(process.execPath)} --pack ${JSON.stringify(patchingPack)}
watch_main --cursor-app ${JSON.stringify(app)} --node ${JSON.stringify(process.execPath)} --pack ${JSON.stringify(patchingPack)}
`, {
    HOME: home,
    MOCK_LOG: mockLog,
    CURSOR_ZH_DRY_RUN: '1',
    CURSOR_ZH_NOTIFY_LOG: notify,
    CURSOR_ZH_LOG_FILE: path.join(dir, 'watch.log'),
    CURSOR_ZH_LIB_ONLY: '1',
  });
  assert.equal(applied.status, 0, applied.stderr);
  const calls = fs.readFileSync(mockLog, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /"apply"/);
  assert.match(calls[0], /--update-checksums/);
  assert.match(calls[0], /--no-sudo/);
  assert.match(fs.readFileSync(notify, 'utf8'), /重新装上简体中文/);
  assert.equal(fs.existsSync(path.join(home, 'Library', 'Application Support', 'cursor-zh-hans', 'watch.lock')), false);
});

test('watcher notifications are once per version when it cannot write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-note-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const resources = path.join(app, 'Contents', 'Resources', 'app');
  fs.writeFileSync(path.join(resources, 'product.json'), '{"version":"3.0.0","commit":"zzz"}\n');
  const notify = path.join(dir, 'notify.log');
  fs.writeFileSync(notify, '');
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
  const result = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/watch.sh'))}
cursor_is_running() { return 1; }
is_app_writable() { return 1; }
watch_main --cursor-app ${JSON.stringify(app)} --node ${JSON.stringify(process.execPath)} --pack ${JSON.stringify(path.join(dir, 'pack'))}
watch_main --cursor-app ${JSON.stringify(app)} --node ${JSON.stringify(process.execPath)} --pack ${JSON.stringify(path.join(dir, 'pack'))}
`, {
    HOME: home,
    CURSOR_ZH_DRY_RUN: '1',
    CURSOR_ZH_NOTIFY_LOG: notify,
    CURSOR_ZH_LOG_FILE: path.join(dir, 'watch.log'),
    CURSOR_ZH_LIB_ONLY: '1',
  });
  assert.equal(result.status, 0, result.stderr);
  const notes = fs.readFileSync(notify, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /管理员密码/);
});

test('the double-click launcher installs through the same menu', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-launch-'));
  const apps = path.join(dir, 'Applications');
  const app = makeCursor(apps);
  const hook = path.join(dir, 'hook.sh');
  fs.writeFileSync(hook, `
cursor_is_running() { return 1; }
ui_menu() { printf 'MENU\\n' >> "$MOCK_UI"; printf '%s\\n' "安装汉化"; }
ui_ask_watch() { return 1; }
ui_alert() { printf 'ALERT %s\\n' "$1" >> "$MOCK_UI"; }
ui_warn() { printf 'WARN %s\\n' "$1" >> "$MOCK_UI"; }
ui_error_with_copy() { printf 'ERROR %s\\n' "$1" >> "$MOCK_UI"; }
relaunch_cursor() { printf 'RELAUNCH %s\\n' "$1" >> "$MOCK_UI"; }
`);
  const env = flowEnv(dir, {
    CURSOR_ZH_SEARCH_ROOTS: apps,
    CURSOR_ZH_KEEP_PATH: '1',
    CURSOR_ZH_TEST_HOOK: hook,
    PATH: '/usr/bin:/bin',
  });
  const mockBin = path.join(dir, 'bin');
  writeExec(path.join(mockBin, 'mdfind'), '#!/bin/bash\nexit 0\n');
  writeExec(path.join(mockBin, 'ps'), '#!/bin/bash\nexit 0\n');
  env.PATH = `${mockBin}:/usr/bin:/bin`;
  const result = spawnSync('bash', [path.join(root, 'packaging/macos/launcher.sh')], {
    encoding: 'utf8',
    cwd: root,
    env: { ...env, TMPDIR: dir, LANG: 'C.UTF-8' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const ui = readUi(env);
  assert.match(ui, /MENU/);
  assert.match(ui, /RELAUNCH/);
  assert.match(ui, /始终允许/);
  assert.deepEqual(cliArgs(env).map((args) => args[0]), ['status', 'apply']);
});

test('install.sh refuses other systems and the uninstall flag is one line', () => {
  const help = runBash('bash install.sh --help', { HOME: os.tmpdir() });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--uninstall/);

  const piped = spawnSync('bash', ['-s', '--', '--help'], {
    encoding: 'utf8',
    cwd: root,
    input: fs.readFileSync(path.join(root, 'install.sh')),
    env: { PATH: '/usr/bin:/bin', HOME: os.tmpdir(), LANG: 'C.UTF-8' },
  });
  assert.equal(piped.status, 0, piped.stderr);
  assert.match(piped.stdout, /个人应用程序/);

  const linux = runBash('bash install.sh --uninstall', { HOME: os.tmpdir() });
  assert.notEqual(linux.status, 0);
  assert.match(linux.stdout, /只适用于 Mac/);
  assert.match(linux.stdout, /install\.ps1/);

  const ps1 = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
  assert.match(ps1, /apply --update-checksums/);
  assert.match(ps1, /cursor-zh\.js restore/);
  assert.match(ps1, /nodejs\.org/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-curl-'));
  const stage = path.join(dir, 'Cursor 汉化.app', 'Contents', 'MacOS');
  writeExec(path.join(stage, 'launcher'), '#!/bin/bash\nexit 0\n');
  const zip = path.join(dir, 'app.zip');
  const packed = spawnSync('python3', [
    path.join(root, 'packaging/macos/zip_app.py'),
    path.join(dir, 'Cursor 汉化.app'),
    zip,
  ], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const mockBin = path.join(dir, 'bin');
  writeExec(path.join(mockBin, 'uname'), `#!/bin/bash
if [[ "\${1:-}" == "-s" ]]; then printf '%s\\n' Darwin; exit 0; fi
printf '%s\\n' Darwin
`);
  const dest = path.join(dir, 'Applications');
  const launchLog = path.join(dir, 'launch.log');
  const result = runBash(`
source ${JSON.stringify(path.join(root, 'install.sh'))}
download_release() { cp ${JSON.stringify(zip)} "$1"; }
install_main --uninstall
`, {
    HOME: path.join(dir, 'home'),
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_INSTALL_DEST: dest,
    CURSOR_ZH_DRY_RUN: '1',
    CURSOR_ZH_LAUNCH_LOG: launchLog,
    CURSOR_ZH_LIB_ONLY: '1',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /恢复成英文/);
  assert.match(result.stdout, /Cursor 汉化\.app/);
  const launched = fs.readFileSync(launchLog, 'utf8');
  assert.match(launched, /Cursor 汉化\.app/);
  assert.match(launched, /--restore/);
  assert.equal(fs.existsSync(path.join(dest, 'Cursor 汉化.app', 'Contents', 'MacOS', 'launcher')), true);
});

test('translocation, Downloads, and a read-only volume must be moved first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-move-'));
  function mustMove(appRoot, extra = {}) {
    const ran = spawnSync('bash', ['--noprofile', '--norc', '-c', `source ${JSON.stringify(path.join(root, 'packaging/lib/common.sh'))}
if installer_must_move ${JSON.stringify(appRoot)}; then printf '%s\\n' 0; else printf '%s\\n' 1; fi
`], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', HOME: dir, TMPDIR: dir, LANG: 'C.UTF-8', ...extra },
    });
    assert.equal(ran.status, 0, ran.stderr);
    return ran.stdout.trim();
  }
  assert.equal(mustMove('/private/var/folders/ab/T/AppTranslocation/UUID/d/Cursor 汉化.app'), '0');
  assert.equal(mustMove('/Users/me/Downloads/Cursor 汉化.app'), '0');
  assert.equal(mustMove('/Users/me/Downloads'), '0');
  const writable = path.join(dir, 'Applications', 'Cursor 汉化.app');
  fs.mkdirSync(writable, { recursive: true });
  assert.equal(mustMove(writable), '1');
  assert.equal(mustMove(writable, { CURSOR_ZH_VOLUME_READONLY: '1' }), '0');
  assert.equal(mustMove('/Applications/Cursor 汉化.app'), '1');

  const readonlyDir = path.join(dir, 'readonly-app');
  fs.mkdirSync(readonlyDir);
  const deniedDir = path.join(dir, 'denied-app');
  fs.mkdirSync(deniedDir);
  const probed = spawnSync('bash', ['--noprofile', '--norc', '-c', `
source ${JSON.stringify(path.join(root, 'packaging/lib/common.sh'))}
touch() {
  printf '%s\\n' "touch: $1: Read-only file system" >&2
  return 1
}
if installer_must_move ${JSON.stringify(readonlyDir)}; then ro=0; else ro=1; fi
touch() {
  printf '%s\\n' "touch: $1: Permission denied" >&2
  return 1
}
if installer_must_move ${JSON.stringify(deniedDir)}; then deny=0; else deny=1; fi
printf '%s %s\\n' "$ro" "$deny"
`], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: dir, TMPDIR: dir, LANG: 'C.UTF-8' },
  });
  assert.equal(probed.status, 0, probed.stderr);
  assert.equal(probed.stdout.trim(), '0 1');

  const app = makeCursor(path.join(dir, 'apps'));
  const { result, env } = sourceGui(dir, 'gui_main', {
    CURSOR_ZH_APP_ROOT: '/private/var/folders/ab/T/AppTranslocation/UUID/d/Cursor 汉化.app',
    CURSOR_ZH_DRY_RUN: '1',
    CURSOR_ZH_SEARCH_ROOTS: path.dirname(app),
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /OPEN \/Applications/);
  assert.match(readUi(env), /拖进「应用程序」/);
  assert.equal(cliArgs(env).length, 0);
  assert.equal(readUi(env).includes('MENU'), false);
});

test('cursor_is_running matches only the target app path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-ps-'));
  const app = '/Applications/Cursor.app';
  const other = '/Applications/Agent/Cursor.app';
  const psFile = path.join(dir, 'ps.txt');
  const mockBin = path.join(dir, 'bin');
  writeExec(path.join(mockBin, 'ps'), `#!/bin/bash
cat ${JSON.stringify(psFile)}
`);
  function running(lines, target) {
    fs.writeFileSync(psFile, `${lines.filter((line) => line !== null).join('\n')}\n`);
    const arg = target === undefined ? '' : JSON.stringify(target);
    const result = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/common.sh'))}
if cursor_is_running ${arg}; then printf '%s\\n' yes; else printf '%s\\n' no; fi
`, { HOME: dir, PATH: `${mockBin}:/usr/bin:/bin` });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  assert.equal(running([
    `${other}/Contents/MacOS/Cursor`,
    'Cursor Helper',
    '/usr/libexec/Cursor Helper (Plugin)',
  ], app), 'no');
  assert.equal(running([
    `${other}/Contents/MacOS/Cursor`,
    `${app}/Contents/MacOS/Cursor Helper (GPU) --type=gpu`,
  ], app), 'yes');
  assert.equal(running([
    `${app}/Contents/MacOS/Cursor --flag`,
  ], app), 'yes');
  assert.equal(running([
    `${app}/Contents/MacOS/Cursor`,
  ], other), 'no');
  assert.equal(running([`${app}/Contents/MacOS/Cursor`], undefined), 'no');
});

test('a save prompt can be retried, and cancel stops the install', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-retry-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const confirmLog = path.join(dir, 'confirms');
  fs.writeFileSync(confirmLog, '');
  const cancelled = sourceGui(dir, `
cursor_is_running() { return 0; }
ui_confirm() {
  printf 'CONFIRM %s\\n' "$2" >> "$MOCK_UI"
  printf 'x\\n' >> ${JSON.stringify(confirmLog)}
  n=$(wc -l < ${JSON.stringify(confirmLog)})
  if [[ "$n" -eq 1 ]]; then return 0; fi
  return 1
}
cmd_install ${JSON.stringify(app)}
`);
  assert.notEqual(cancelled.result.status, 0);
  assert.equal(cliArgs(cancelled.env).length, 0);
  assert.match(readUi(cancelled.env), /重试/);
  assert.match(readUi(cancelled.env), /已取消/);
  assert.equal(readUi(cancelled.env).includes('QUIT'), true);

  const retried = sourceGui(path.join(dir, 'retry'), `
cursor_is_running() {
  n=$(wc -l < ${JSON.stringify(confirmLog)})
  if [[ "$n" -ge 2 ]]; then return 1; fi
  return 0
}
ui_confirm() {
  printf 'CONFIRM %s\\n' "$2" >> "$MOCK_UI"
  printf 'x\\n' >> ${JSON.stringify(confirmLog)}
  return 0
}
: > ${JSON.stringify(confirmLog)}
cmd_install ${JSON.stringify(app)}
`);
  assert.equal(retried.result.status, 0, retried.result.stderr);
  assert.match(readUi(retried.env), /重试/);
  assert.ok(cliArgs(retried.env).some((args) => args[0] === 'apply'));
});

test('an admin install chowns support, the agent plist, and the log back to the user', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-chown-'));
  const home = path.join(dir, 'home');
  const support = path.join(home, 'Library', 'Application Support', 'cursor-zh-hans');
  const plist = path.join(home, 'Library', 'LaunchAgents', 'com.po1nt9.cursor-zh-hans.watch.plist');
  const logFile = path.join(dir, 'cursor-zh-hans.log');
  fs.mkdirSync(support, { recursive: true });
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.writeFileSync(plist, '<plist></plist>');
  fs.writeFileSync(logFile, 'log\n');
  fs.writeFileSync(path.join(support, 'watch.lock'), '');
  const elevated = path.join(dir, 'elevated.args');
  const mismatched = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/gui.sh'))}
CLI_ELEVATED=1
file_owner_uid() { printf '%s\\n' "999"; }
run_elevated() { printf '%s\\n' "$*" >> ${JSON.stringify(elevated)}; return 0; }
reclaim_user_files
`, {
    HOME: home,
    CURSOR_ZH_LOG_FILE: logFile,
    CURSOR_ZH_NODE: process.execPath,
  });
  assert.equal(mismatched.status, 0, mismatched.stderr);
  const chownLine = fs.readFileSync(elevated, 'utf8');
  assert.match(chownLine, /\/usr\/sbin\/chown/);
  assert.match(chownLine, /-R/);
  assert.ok(chownLine.includes(support));
  assert.ok(chownLine.includes(plist));
  assert.ok(chownLine.includes(logFile));
  const agentsDir = path.join(home, 'Library', 'LaunchAgents');
  assert.equal(chownLine.split(' ').includes(agentsDir), false);

  fs.writeFileSync(elevated, '');
  const owned = runBash(`
source ${JSON.stringify(path.join(root, 'packaging/lib/gui.sh'))}
CLI_ELEVATED=1
run_elevated() { printf '%s\\n' "$*" >> ${JSON.stringify(elevated)}; return 0; }
reclaim_user_files
`, {
    HOME: home,
    CURSOR_ZH_LOG_FILE: logFile,
    CURSOR_ZH_NODE: process.execPath,
  });
  assert.equal(owned.status, 0, owned.stderr);
  assert.equal(fs.readFileSync(elevated, 'utf8'), '');
});

test('restore removes the support folder, agent, and lock, and can keep the log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-cleanup-'));
  const app = makeCursor(path.join(dir, 'apps'));
  const installed = sourceGui(dir, `cmd_install ${JSON.stringify(app)}`);
  assert.equal(installed.result.status, 0, installed.result.stderr);
  const support = path.join(installed.env.HOME, 'Library', 'Application Support', 'cursor-zh-hans');
  const plist = path.join(installed.env.HOME, 'Library', 'LaunchAgents', 'com.po1nt9.cursor-zh-hans.watch.plist');
  fs.mkdirSync(path.join(support, 'watch.lock'));
  assert.equal(fs.existsSync(plist), true);
  assert.equal(fs.existsSync(support), true);

  const kept = sourceGui(dir, `
ui_confirm() {
  printf 'CONFIRM %s %s\\n' "$2" "$3" >> "$MOCK_UI"
  if [[ "$1" == *安装日志* ]]; then return 1; fi
  return 0
}
cmd_restore ${JSON.stringify(app)}
`, {
    HOME: installed.env.HOME,
    MOCK_UI: installed.env.MOCK_UI,
    MOCK_LOG: path.join(dir, 'restore-cli.log'),
    CURSOR_ZH_LOG_FILE: installed.env.CURSOR_ZH_LOG_FILE,
    CURSOR_ZH_PACK: installed.env.CURSOR_ZH_PACK,
  });
  assert.equal(kept.result.status, 0, kept.result.stderr);
  assert.equal(fs.existsSync(plist), false);
  assert.equal(fs.existsSync(support), false);
  assert.equal(fs.existsSync(path.join(support, 'watch.lock')), false);
  assert.match(readUi(kept.env), /删掉日志/);
  assert.match(readUi(kept.env), /留着/);
  assert.equal(fs.existsSync(installed.env.CURSOR_ZH_LOG_FILE), true);

  const again = sourceGui(path.join(dir, 'again'), `cmd_install ${JSON.stringify(app)}`, {
    HOME: installed.env.HOME,
    CURSOR_ZH_LOG_FILE: installed.env.CURSOR_ZH_LOG_FILE,
  });
  assert.equal(again.result.status, 0, again.result.stderr);
  assert.equal(fs.existsSync(support), true);
  const failed = sourceGui(path.join(dir, 'fail'), `cmd_restore ${JSON.stringify(app)}`, {
    HOME: installed.env.HOME,
    CURSOR_ZH_LOG_FILE: installed.env.CURSOR_ZH_LOG_FILE,
    MOCK_RESTORE_CODE: '1',
    MOCK_RESTORE_OUTPUT: '磁盘满了，写不回去。',
  });
  assert.notEqual(failed.result.status, 0);
  assert.equal(fs.existsSync(path.join(installed.env.HOME, 'Library', 'LaunchAgents', 'com.po1nt9.cursor-zh-hans.watch.plist')), false);
  assert.equal(fs.existsSync(support), true);
  assert.match(readUi(failed.env), /自动重新安装已经关掉/);
  assert.match(readUi(failed.env), /没有恢复成英文/);
  assert.equal(readUi(failed.env).includes('删掉日志'), false);
});

test('the main menu cancel stops before any install', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-menu-'));
  const apps = path.join(dir, 'Applications');
  makeCursor(apps);
  const mockBin = path.join(dir, 'bin');
  writeExec(path.join(mockBin, 'mdfind'), '#!/bin/bash\nexit 0\n');
  writeExec(path.join(mockBin, 'ps'), '#!/bin/bash\nexit 0\n');
  const { result, env } = sourceGui(dir, `
ui_menu() { printf 'MENU\\n' >> "$MOCK_UI"; return 1; }
gui_main
`, {
    CURSOR_ZH_SEARCH_ROOTS: apps,
    PATH: `${mockBin}:/usr/bin:/bin`,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(readUi(env), /MENU/);
  assert.match(readUi(env), /已取消/);
  assert.equal(cliArgs(env).length, 0);
});

test('install.sh says when no release has been published', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-404-'));
  const mockBin = path.join(dir, 'bin');
  const dest = path.join(dir, 'out.zip');
  writeExec(path.join(mockBin, 'curl'), `#!/bin/bash
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [[ -n "$out" ]]; then printf '%s\\n' "missing" > "$out"; fi
if [[ "\${MOCK_CURL_EXIT:-0}" != 0 ]]; then exit "$MOCK_CURL_EXIT"; fi
printf '%s' "\${MOCK_CURL_CODE:-404}"
`);
  writeExec(path.join(mockBin, 'uname'), `#!/bin/bash
printf '%s\\n' Darwin
`);
  const missing = runBash(`
source ${JSON.stringify(path.join(root, 'install.sh'))}
download_release ${JSON.stringify(dest)}
`, {
    HOME: path.join(dir, 'home'),
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_LIB_ONLY: '1',
    MOCK_CURL_CODE: '404',
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stdout, /还没有发布安装包/);
  assert.match(missing.stdout, /v0\.1\.0/);
  assert.equal(fs.existsSync(dest), false);

  const offline = runBash(`
source ${JSON.stringify(path.join(root, 'install.sh'))}
download_release ${JSON.stringify(dest)}
`, {
    HOME: path.join(dir, 'home'),
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_LIB_ONLY: '1',
    MOCK_CURL_EXIT: '6',
  });
  assert.notEqual(offline.status, 0);
  assert.match(offline.stdout, /网络不太好/);

  const viaMain = runBash(`
source ${JSON.stringify(path.join(root, 'install.sh'))}
install_main
`, {
    HOME: path.join(dir, 'home'),
    PATH: `${mockBin}:/usr/bin:/bin`,
    CURSOR_ZH_LIB_ONLY: '1',
    CURSOR_ZH_INSTALL_DEST: path.join(dir, 'Applications'),
    MOCK_CURL_CODE: '404',
  });
  assert.notEqual(viaMain.status, 0);
  assert.match(viaMain.stdout, /还没有发布安装包/);
  assert.equal(viaMain.stdout.includes('请到 GitHub 的发布页'), false);
});
