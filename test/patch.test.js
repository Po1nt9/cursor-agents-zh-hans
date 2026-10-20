import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { apply } from '../src/apply.js';
import { sha256Base64, sha256Hex } from '../src/checksum.js';
import { injectHtml, removeInjection } from '../src/html-inject.js';
import { restore } from '../src/restore.js';
import { applyStaticReplacements, countQuotedLiteral } from '../src/static-replace.js';
import { REL_GLASS, REL_HTML, REL_PRODUCT, STATIC_MARKER } from '../src/version.js';

const quit = () => ({ checked: true, running: false, pids: [] });

function writeApp(dir) {
  const app = path.join(dir, 'app');
  const html = '<!DOCTYPE html>\n<html>\n<body aria-label="">\n</body>\n<script src="./workbench.js" type="module"></script>\n</html>\n';
  const glass = [
    'function render() {',
    '  const a = "Give Agents a Computer";',
    '  const b = "New Agents Window";',
    '  const c = "New Agents Window (Glass)";',
    '  return a + b + c;',
    '}',
    '',
  ].join('\n');
  const htmlPath = path.join(app, REL_HTML);
  const glassPath = path.join(app, REL_GLASS);
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.mkdirSync(path.dirname(glassPath), { recursive: true });
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(glassPath, glass);
  const product = {
    nameShort: 'Cursor',
    applicationName: 'cursor',
    version: '9.9.9',
    commit: 'abc123',
    realCommit: 'def456',
    checksums: {
      'vs/code/electron-sandbox/workbench/workbench.html': sha256Base64(html),
      'vs/workbench/workbench.desktop.main.js': 'untouchedHashValue000000000000000000000',
    },
  };
  const productRaw = `${JSON.stringify(product, null, 2)}\n`;
  fs.writeFileSync(path.join(app, REL_PRODUCT), productRaw);
  return { app, html, glass, productRaw };
}

function dictionaryDir(dir) {
  const dictionary = path.join(dir, 'dictionary');
  fs.mkdirSync(dictionary);
  fs.writeFileSync(path.join(dictionary, 'exact.json'), JSON.stringify({
    'Give Agents a Computer': '给智能体一台电脑',
    'New Agents Window': '新建智能体窗口',
    'New Agents Window (Glass)': '新建智能体窗口（Glass）',
    Cancel: '取消',
  }));
  fs.writeFileSync(path.join(dictionary, 'fragments.json'), '[]\n');
  fs.writeFileSync(path.join(dictionary, 'regex.json'), '[]\n');
  fs.writeFileSync(path.join(dictionary, 'static-glass.json'), JSON.stringify({
    rules: [
      {
        id: 'give',
        literal: 'Give Agents a Computer',
        translation: '给智能体一台电脑',
        expectedHits: { '9.9.9': 1 },
      },
      {
        id: 'new-window',
        literal: 'New Agents Window',
        translation: '新建智能体窗口',
        context: 'const b',
        expectedHits: { '9.9.9': 1 },
      },
    ],
  }));
  return dictionary;
}

function options(app, dir, extra = {}) {
  return {
    appPath: app,
    dataDir: path.join(dir, 'data'),
    dictionaryDir: dictionaryDir(dir),
    processCheck: quit,
    platform: 'linux',
    codesign: false,
    clearQuarantine: false,
    ...extra,
  };
}

test('injection block is reversible', () => {
  const html = '<script src="./workbench.js" type="module"></script>\n';
  const injected = injectHtml(html);
  assert.equal(injected.already, false);
  assert.match(injected.html, /cursor-zh-hans\.js/);
  assert.equal(removeInjection(injected.html).html, html);
  assert.equal(injectHtml(injected.html).already, true);
});

test('injection keeps the workbench script indent and still round-trips', () => {
  const html = '<body>\n</body>\n\t<script src="./workbench.js" type="module"></script>\n';
  const injected = injectHtml(html);
  assert.match(injected.html, /\n\t<!-- cursor-zh-hans:start -->\n\t<script src="\.\/cursor-zh-hans\.js"><\/script>\n/);
  assert.ok(injected.html.indexOf('cursor-zh-hans.js') < injected.html.indexOf('workbench.js'));
  assert.equal(removeInjection(injected.html).html, html);
});

test('quoted replacement does not eat a longer literal', () => {
  const source = 'var b = "New Agents Window"; var c = "New Agents Window (Glass)";';
  assert.equal(countQuotedLiteral(source, 'New Agents Window'), 1);
  const replaced = applyStaticReplacements(source, [
    {
      id: 'new-window',
      literal: 'New Agents Window',
      translation: '新建智能体窗口',
      expectedHits: { v: 1 },
    },
  ], 'v');
  assert.equal(replaced.ok, true);
  assert.match(replaced.source, /"新建智能体窗口"/);
  assert.match(replaced.source, /"New Agents Window \(Glass\)"/);
});

test('static mismatch leaves the source untouched', () => {
  const source = 'var a = "Give Agents a Computer";';
  const result = applyStaticReplacements(source, [
    {
      id: 'give',
      literal: 'Give Agents a Computer',
      translation: '给智能体一台电脑',
      expectedHits: { v: 4 },
    },
  ], 'v');
  assert.equal(result.ok, false);
  assert.equal(result.source, source);
});

test('short static rules are skipped instead of applied', () => {
  const source = 'var a = "Agent";';
  const result = applyStaticReplacements(source, [
    {
      id: 'agent',
      literal: 'Agent',
      translation: '智能体',
      expectedHits: { v: 1 },
    },
  ], 'v');
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.source, source);
  assert.equal(result.reports[0].status, 'skipped-ambiguous');
});

test('apply then restore is byte-identical, and checksums stay put unless asked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-patch-'));
  const fixture = writeApp(dir);
  const htmlPath = path.join(fixture.app, REL_HTML);
  const glassPath = path.join(fixture.app, REL_GLASS);
  const productPath = path.join(fixture.app, REL_PRODUCT);
  const before = {
    html: fs.readFileSync(htmlPath),
    glass: fs.readFileSync(glassPath),
    product: fs.readFileSync(productPath),
  };

  const applied = apply(options(fixture.app, dir));
  assert.equal(applied.ok, true);
  assert.ok(fs.existsSync(path.join(fixture.app, 'out/vs/code/electron-sandbox/workbench/cursor-zh-hans.js')));
  assert.match(fs.readFileSync(htmlPath, 'utf8'), /cursor-zh-hans:start/);
  assert.ok(before.product.equals(fs.readFileSync(productPath)));
  assert.ok(before.glass.equals(fs.readFileSync(glassPath)));

  restore({
    appPath: fixture.app,
    dataDir: path.join(dir, 'data'),
    processCheck: quit,
    platform: 'linux',
  });
  assert.ok(before.html.equals(fs.readFileSync(htmlPath)));
  assert.ok(before.glass.equals(fs.readFileSync(glassPath)));
  assert.ok(before.product.equals(fs.readFileSync(productPath)));
  assert.equal(fs.existsSync(path.join(fixture.app, 'out/vs/code/electron-sandbox/workbench/cursor-zh-hans.js')), false);
});

test('static apply validates syntax and restore returns the original bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-static-'));
  const fixture = writeApp(dir);
  const glassPath = path.join(fixture.app, REL_GLASS);
  const productPath = path.join(fixture.app, REL_PRODUCT);
  const beforeGlass = fs.readFileSync(glassPath);
  const beforeProduct = fs.readFileSync(productPath);

  apply(options(fixture.app, dir, { static: true, updateChecksums: true }));
  const glass = fs.readFileSync(glassPath, 'utf8');
  assert.match(glass, /给智能体一台电脑/);
  assert.match(glass, /新建智能体窗口/);
  assert.match(glass, /New Agents Window \(Glass\)/);
  assert.match(glass, new RegExp(STATIC_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  assert.equal(
    product.checksums['vs/code/electron-sandbox/workbench/workbench.html'],
    sha256Base64(fs.readFileSync(path.join(fixture.app, REL_HTML))),
  );
  assert.equal(product.checksums['vs/workbench/workbench.desktop.main.js'], 'untouchedHashValue000000000000000000000');
  assert.notEqual(sha256Hex(fs.readFileSync(productPath)), sha256Hex(beforeProduct));

  restore({
    appPath: fixture.app,
    dataDir: path.join(dir, 'data'),
    dictionaryDir: path.join(dir, 'dictionary'),
    processCheck: quit,
    platform: 'linux',
  });
  assert.ok(beforeGlass.equals(fs.readFileSync(glassPath)));
  assert.ok(beforeProduct.equals(fs.readFileSync(productPath)));
});

test('a static hit-count mismatch does not modify the install', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-mismatch-'));
  const fixture = writeApp(dir);
  const dictionary = path.join(dir, 'dictionary');
  fs.mkdirSync(dictionary);
  fs.writeFileSync(path.join(dictionary, 'exact.json'), '{"Cancel":"取消"}\n');
  fs.writeFileSync(path.join(dictionary, 'fragments.json'), '[]\n');
  fs.writeFileSync(path.join(dictionary, 'regex.json'), '[]\n');
  fs.writeFileSync(path.join(dictionary, 'static-glass.json'), JSON.stringify({
    rules: [{
      id: 'give',
      literal: 'Give Agents a Computer',
      translation: '给智能体一台电脑',
      expectedHits: { '9.9.9': 9 },
    }],
  }));
  const glassPath = path.join(fixture.app, REL_GLASS);
  const before = fs.readFileSync(glassPath);
  assert.throws(() => apply({
    appPath: fixture.app,
    dataDir: path.join(dir, 'data'),
    dictionaryDir: dictionary,
    processCheck: quit,
    platform: 'linux',
    static: true,
  }), /命中次数/);
  assert.ok(before.equals(fs.readFileSync(glassPath)));
  assert.equal(fs.existsSync(path.join(fixture.app, '.cursor-zh-hans')), false);
});

test('refuses to patch while Cursor is running', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-running-'));
  const fixture = writeApp(dir);
  assert.throws(() => apply(options(fixture.app, dir, {
    processCheck: () => ({ checked: true, running: true, pids: [42] }),
  })), /正在运行/);
});

test('a Cursor update without leftover markers is patched from the new files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-update-'));
  const fixture = writeApp(dir);
  const opts = options(fixture.app, dir);
  apply(opts);
  const productPath = path.join(fixture.app, REL_PRODUCT);
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  product.version = '9.9.10';
  product.commit = 'newcommit';
  fs.writeFileSync(productPath, `${JSON.stringify(product, null, 2)}\n`);
  fs.writeFileSync(path.join(fixture.app, REL_HTML), fixture.html);
  fs.rmSync(path.join(fixture.app, 'out/vs/code/electron-sandbox/workbench/cursor-zh-hans.js'));
  const again = apply({ ...opts, dictionaryDir: path.join(dir, 'dictionary') });
  assert.match(again.warnings.join('\n'), /更新/);
  assert.match(fs.readFileSync(path.join(fixture.app, REL_HTML), 'utf8'), /cursor-zh-hans:start/);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'backups')));
});

test('a missing backup can be rebuilt by stripping the injection', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-rebuild-'));
  const fixture = writeApp(dir);
  const opts = options(fixture.app, dir, { updateChecksums: true });
  const htmlPath = path.join(fixture.app, REL_HTML);
  const productPath = path.join(fixture.app, REL_PRODUCT);
  const beforeHtml = fs.readFileSync(htmlPath);
  const beforeProduct = fs.readFileSync(productPath);
  apply(opts);
  assert.match(fs.readFileSync(htmlPath, 'utf8'), /cursor-zh-hans:start/);
  fs.rmSync(path.join(dir, 'data', 'backups'), { recursive: true, force: true });
  assert.throws(() => restore({
    appPath: fixture.app,
    dataDir: path.join(dir, 'data'),
    processCheck: quit,
    platform: 'linux',
  }), /可以去掉界面注入/);
  assert.match(fs.readFileSync(htmlPath, 'utf8'), /cursor-zh-hans:start/);

  const rebuilt = restore({
    appPath: fixture.app,
    dataDir: path.join(dir, 'data'),
    processCheck: quit,
    platform: 'linux',
    rebuildWithoutBackup: true,
  });
  assert.equal(rebuilt.rebuiltWithoutBackup, true);
  assert.ok(beforeHtml.equals(fs.readFileSync(htmlPath)));
  assert.ok(beforeProduct.equals(fs.readFileSync(productPath)));
  assert.equal(fs.existsSync(path.join(fixture.app, 'out/vs/code/electron-sandbox/workbench/cursor-zh-hans.js')), false);
  assert.equal(fs.existsSync(path.join(fixture.app, '.cursor-zh-hans')), false);
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  assert.equal(product.checksums['vs/code/electron-sandbox/workbench/workbench.html'], sha256Base64(beforeHtml));
});

test('a missing backup does not silently undo a static glass patch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-rebuild-static-'));
  const fixture = writeApp(dir);
  const opts = options(fixture.app, dir, { static: true, updateChecksums: true });
  apply(opts);
  const glassPath = path.join(fixture.app, REL_GLASS);
  const patched = fs.readFileSync(glassPath);
  assert.match(patched.toString('utf8'), /给智能体一台电脑/);
  fs.rmSync(path.join(dir, 'data', 'backups'), { recursive: true, force: true });
  assert.throws(() => restore({
    appPath: fixture.app,
    dataDir: path.join(dir, 'data'),
    dictionaryDir: path.join(dir, 'dictionary'),
    processCheck: quit,
    platform: 'linux',
    rebuildWithoutBackup: true,
  }), (error) => {
    assert.match(error.message, /做过 Glass 静态替换/);
    assert.equal(error.message.includes('可以去掉界面注入'), false);
    return true;
  });
  assert.ok(patched.equals(fs.readFileSync(glassPath)));
  assert.match(fs.readFileSync(path.join(fixture.app, REL_HTML), 'utf8'), /cursor-zh-hans:start/);
});
