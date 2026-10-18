import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sha256Base64 } from '../src/checksum.js';
import { REL_HTML } from '../src/version.js';

const CLI = path.resolve('bin/cursor-zh.js');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-cli-'));
  const app = path.join(dir, 'app');
  const html = '<!DOCTYPE html>\n<script src="./workbench.js" type="module"></script>\n';
  const htmlPath = path.join(app, REL_HTML);
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html);
  const product = {
    applicationName: 'cursor',
    nameShort: 'Cursor',
    version: '1.2.3',
    commit: 'commitsha',
    checksums: {
      'vs/code/electron-sandbox/workbench/workbench.html': sha256Base64(html),
    },
  };
  fs.writeFileSync(path.join(app, 'product.json'), `${JSON.stringify(product, null, 2)}\n`);
  const dictionary = path.join(dir, 'dictionary');
  fs.mkdirSync(dictionary);
  fs.writeFileSync(path.join(dictionary, 'exact.json'), '{"Cancel":"取消"}\n');
  fs.writeFileSync(path.join(dictionary, 'fragments.json'), '[]\n');
  fs.writeFileSync(path.join(dictionary, 'regex.json'), '[]\n');
  fs.writeFileSync(path.join(dictionary, 'static-glass.json'), '{"rules":[]}\n');
  return { dir, app, dictionary, htmlPath, original: fs.readFileSync(htmlPath) };
}

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

test('CLI apply and restore round-trip a fixture install', () => {
  const { dir, app, dictionary, htmlPath, original } = fixture();
  const data = path.join(dir, 'data');
  const common = ['--app-path', app, '--data-dir', data, '--dictionary', dictionary, '--force', '--no-codesign', '--no-clear-quarantine'];
  const status = run(['status', ...common]);
  assert.match(status, /未安装/);
  const applied = run(['apply', ...common]);
  assert.match(applied, /注入/);
  assert.match(fs.readFileSync(htmlPath, 'utf8'), /cursor-zh-hans\.js/);
  const doctor = run(['doctor', ...common]);
  assert.match(doctor, /校验和/);
  run(['restore', ...common]);
  assert.ok(original.equals(fs.readFileSync(htmlPath)));
  const after = run(['status', ...common]);
  assert.match(after, /未安装/);
});
