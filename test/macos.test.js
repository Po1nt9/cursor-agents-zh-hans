import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { apply } from '../src/apply.js';
import { escalateIfNeeded } from '../src/cli.js';
import {
  codesignArgs,
  formatSigningLines,
  parseCodesignDisplay,
  readMacEntitlements,
  readMacSigningHealth,
  runMacPostProcess,
} from '../src/macos.js';
import { REL_HTML, REL_PRODUCT } from '../src/version.js';

const APP = '/Applications/Agent/Cursor.app/Contents/Resources/app';
const BUNDLE = '/Applications/Agent/Cursor.app';

test('codesign argv keeps entitlements only', () => {
  const calls = [];
  const result = runMacPostProcess(APP, {
    platform: 'darwin',
    clearQuarantine: false,
    execFile(cmd, args) {
      calls.push([cmd, args]);
      if (args.includes('--entitlements')) {
        return '<?xml version="1.0"?><plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>';
      }
      return '';
    },
  });
  const sign = calls.filter((call) => call[0] === 'codesign' && call[1].includes('--sign'));
  assert.equal(sign.length, 1);
  assert.deepEqual(sign[0][1], codesignArgs(BUNDLE));
  assert.deepEqual(sign[0][1], ['--force', '--sign', '-', '--preserve-metadata=entitlements', BUNDLE]);
  const read = calls.filter((call) => call[0] === 'codesign' && call[1].includes('--entitlements'));
  assert.deepEqual(read[0][1], ['-d', '--entitlements', '-', '--xml', BUNDLE]);
  assert.equal(sign[0][1].includes('--deep'), false);
  assert.equal(sign[0][1].some((arg) => arg.includes('flags')), false);
  assert.equal(sign[0][1].some((arg) => arg.includes('requirements')), false);
  assert.equal(result.entitlementsMissing, false);
  assert.equal(result.codesignFailed, false);
});

test('codesign failure does not fall back to a signature that drops entitlements', () => {
  const calls = [];
  const result = runMacPostProcess(APP, {
    platform: 'darwin',
    clearQuarantine: false,
    execFile(_cmd, args) {
      calls.push(args);
      if (args.includes('--sign')) throw new Error('codesign failed');
      return '';
    },
  });
  assert.equal(result.codesignFailed, true);
  assert.equal(calls.filter((args) => args.includes('--sign')).length, 1);
  assert.equal(calls.some((args) => args.includes('--deep')), false);
});

test('an unreadable entitlement check is unknown and does not roll back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-sign-'));
  const { app, htmlPath } = fixture(dir);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const result = apply({
    appPath: app,
    dataDir: path.join(dir, 'data'),
    dictionaryDir: path.join(dir, 'dictionary'),
    platform: 'darwin',
    clearQuarantine: false,
    processCheck: () => ({ checked: true, running: false, pids: [] }),
    execFile(_cmd, args) {
      if (args.includes('--entitlements')) {
        const error = new Error('could not read entitlements');
        error.stderr = 'could not read entitlements';
        throw error;
      }
      return '';
    },
  });
  assert.equal(result.signing.entitlementsMissing, false);
  assert.equal(result.signing.codesignFailed, false);
  assert.notEqual(fs.readFileSync(htmlPath, 'utf8'), html);
  const unread = readMacEntitlements(BUNDLE, () => {
    throw new Error('could not read entitlements');
  });
  assert.equal(unread.missing, false);
  assert.equal(unread.reason, 'unknown');
});

test('a failed rollback still reports the entitlement error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-sign-'));
  const { app } = fixture(dir);
  assert.throws(() => apply({
    appPath: app,
    dataDir: path.join(dir, 'data'),
    dictionaryDir: path.join(dir, 'dictionary'),
    platform: 'darwin',
    clearQuarantine: false,
    processCheck: () => ({ checked: true, running: false, pids: [] }),
    execFile(_cmd, args) {
      if (args.includes('--entitlements')) return '';
      return '';
    },
    restoreImpl() {
      throw new Error('backup missing');
    },
  }), (error) => {
    assert.match(error.message, /重新安装 Cursor/);
    assert.match(error.message, /backup missing/);
    return true;
  });
});

test('empty entitlements are reported after signing', () => {
  const result = runMacPostProcess(APP, {
    platform: 'darwin',
    clearQuarantine: false,
    execFile(_cmd, args) {
      if (args.includes('--entitlements')) return '';
      return '';
    },
  });
  assert.equal(result.entitlementsMissing, true);
  assert.match(result.warnings.join('\n'), /entitlements/);
});

test('doctor can see an empty entitlement plist', () => {
  const empty = readMacEntitlements('/Applications/Cursor.app', () => '');
  assert.equal(empty.missing, true);
  const present = readMacEntitlements('/Applications/Cursor.app', () => '<?xml version="1.0"?><plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>');
  assert.equal(present.missing, false);
  const unsigned = readMacEntitlements('/Applications/Cursor.app', () => {
    const error = new Error('code object is not signed at all');
    error.stderr = 'code object is not signed at all';
    throw error;
  });
  assert.equal(unsigned.missing, true);
});

test('doctor flags hardened runtime on an ad-hoc signature and a Team ID mismatch', () => {
  const main = [
    'Signature=adhoc',
    'flags=0x10002(adhoc,runtime)',
    'TeamIdentifier=not set',
  ].join('\n');
  const framework = [
    'Authority=Developer ID Application: Example',
    'flags=0x10000(runtime)',
    'TeamIdentifier=TEAMID',
  ].join('\n');
  assert.equal(parseCodesignDisplay(main).adhoc, true);
  assert.equal(parseCodesignDisplay(main).runtime, true);
  assert.equal(parseCodesignDisplay(main).teamId, 'not set');
  const health = readMacSigningHealth(BUNDLE, (_cmd, args) => {
    if (args.includes('--entitlements')) {
      return '<plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>';
    }
    if (args.join(' ').includes('Electron Framework')) return framework;
    return main;
  });
  assert.equal(health.hardenedAdhoc, true);
  assert.equal(health.teamMismatch, true);
  const lines = formatSigningLines(health).join('\n');
  assert.match(lines, /SIGKILL/);
  assert.match(lines, /重新安装/);
  assert.match(lines, /--preserve-metadata=entitlements/);

  const safe = readMacSigningHealth(BUNDLE, (_cmd, args) => {
    if (args.includes('--entitlements')) {
      return '<plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>';
    }
    if (args.join(' ').includes('Electron Framework')) return framework;
    return 'Signature=adhoc\nflags=0x2(adhoc)\nTeamIdentifier=not set\n';
  });
  assert.equal(safe.hardenedAdhoc, false);
  assert.equal(safe.teamMismatch, true);
  const safeLines = formatSigningLines(safe).join('\n');
  assert.match(safeLines, /预期/);
  assert.equal(safeLines.includes('SIGKILL'), false);
});

function fixture(dir) {
  const app = path.join(dir, 'Cursor.app', 'Contents', 'Resources', 'app');
  const htmlPath = path.join(app, REL_HTML);
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  const html = '<!DOCTYPE html>\n<html>\n<body></body>\n<script src="./workbench.js" type="module"></script>\n</html>\n';
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(path.join(app, REL_PRODUCT), `${JSON.stringify({
    nameShort: 'Cursor',
    applicationName: 'cursor',
    version: '9.9.9',
    commit: 'abc123',
    checksums: {},
  }, null, 2)}\n`);
  const dictionary = path.join(dir, 'dictionary');
  fs.mkdirSync(dictionary);
  fs.writeFileSync(path.join(dictionary, 'exact.json'), '{"Cancel":"取消"}\n');
  fs.writeFileSync(path.join(dictionary, 'fragments.json'), '[]\n');
  fs.writeFileSync(path.join(dictionary, 'regex.json'), '[]\n');
  return { app, html, htmlPath };
}

test('empty entitlements roll the patch back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-sign-'));
  const { app, html, htmlPath } = fixture(dir);
  assert.throws(() => apply({
    appPath: app,
    dataDir: path.join(dir, 'data'),
    dictionaryDir: path.join(dir, 'dictionary'),
    platform: 'darwin',
    clearQuarantine: false,
    processCheck: () => ({ checked: true, running: false, pids: [] }),
    execFile(_cmd, args) {
      if (args.includes('--entitlements')) return '';
      return '';
    },
  }), /重新安装 Cursor/);
  assert.equal(fs.readFileSync(htmlPath, 'utf8'), html);
  assert.equal(fs.existsSync(path.join(app, 'out/vs/code/electron-sandbox/workbench/cursor-zh-hans.js')), false);
});

test('sudo is skipped when the app is writable and used only when it is not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-sudo-'));
  const { app } = fixture(dir);
  let called = false;
  const skipped = escalateIfNeeded({
    command: 'apply',
    appPath: app,
    platform: 'darwin',
    getuid: () => 501,
    relaunchWithSudo() { called = true; },
  });
  assert.equal(skipped, false);
  assert.equal(called, false);

  const argv = ['node', 'bin/cursor-zh.js', 'apply', '--app-path', app];
  const launched = [];
  const escalated = escalateIfNeeded({
    command: 'apply',
    appPath: app,
    platform: 'darwin',
    getuid: () => 501,
    argv,
    accessSync() {
      const error = new Error('EACCES');
      throw error;
    },
    relaunchWithSudo(next) {
      launched.push(next);
    },
  });
  assert.equal(escalated, true);
  assert.deepEqual(launched[0], argv);

  const rooted = escalateIfNeeded({
    command: 'apply',
    appPath: app,
    platform: 'darwin',
    getuid: () => 0,
    accessSync() { throw new Error('EACCES'); },
    relaunchWithSudo() { throw new Error('should not sudo as root'); },
  });
  assert.equal(rooted, false);
});
