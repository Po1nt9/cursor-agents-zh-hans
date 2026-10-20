import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the Mac zip keeps the app layout and executable bits', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-dist-'));
  const built = spawnSync('bash', [path.join(root, 'packaging/macos/build-app.sh'), '--stub'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CURSOR_ZH_DIST: dist,
      CURSOR_ZH_NODE_STUB: '1',
    },
  });
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  const zipPath = path.join(dist, 'Cursor-zh-hans-macOS.zip');
  assert.equal(fs.existsSync(zipPath), true);

  const checked = spawnSync('python3', [
    path.join(root, 'packaging/macos/zip_app.py'),
    '--check',
    zipPath,
  ], { encoding: 'utf8' });
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);

  const unpacked = path.join(dist, 'unpacked');
  fs.mkdirSync(unpacked);
  const unzipped = spawnSync('unzip', ['-q', zipPath, '-d', unpacked], { encoding: 'utf8' });
  assert.equal(unzipped.status, 0, unzipped.stderr);
  const launcher = path.join(unpacked, 'Cursor 汉化.app', 'Contents', 'MacOS', 'launcher');
  const arm = path.join(unpacked, 'Cursor 汉化.app', 'Contents', 'Resources', 'node', 'arm64', 'node');
  const x64 = path.join(unpacked, 'Cursor 汉化.app', 'Contents', 'Resources', 'node', 'x64', 'node');
  for (const file of [launcher, arm, x64]) {
    const mode = fs.statSync(file).mode;
    assert.ok(mode & 0o111, `${file} mode ${mode.toString(8)} is not executable`);
  }
  const plist = fs.readFileSync(path.join(unpacked, 'Cursor 汉化.app', 'Contents', 'Info.plist'), 'utf8');
  assert.match(plist, /<key>CFBundleExecutable<\/key>\s*<string>launcher<\/string>/);
  assert.match(plist, /Cursor 汉化/);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  assert.match(plist, new RegExp(`<string>${version}</string>`));
  assert.equal(
    fs.existsSync(path.join(unpacked, 'Cursor 汉化.app', 'Contents', 'Resources', 'pack', 'bin', 'cursor-zh.js')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(unpacked, 'Cursor 汉化.app', 'Contents', 'Resources', 'pack', 'dictionary', 'exact.json')),
    true,
  );
  const stub = spawnSync(arm, [], { encoding: 'utf8' });
  assert.equal(stub.status, 0, stub.stderr);
  assert.match(stub.stdout, /cursor-zh-stub-node arm64/);
});
