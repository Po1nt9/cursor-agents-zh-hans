import fs from 'node:fs';
import path from 'node:path';
import {
  backupFilePath,
  backupRootFor,
  readManifest,
  readState,
  removeState,
} from './backup.js';
import { replaceChecksum, sha256Base64, sha256Hex } from './checksum.js';
import { CliError } from './errors.js';
import { removeInjection } from './html-inject.js';
import { EMPTY_ENTITLEMENTS_MESSAGE, runMacPostProcess } from './macos.js';
import { appFiles, chownInvokingUser, detectAppPath, userDataDir } from './paths.js';
import { inspectCursorProcesses } from './process-check.js';
import { readProductFile } from './product.js';
import { CHECKSUM_HTML, HTML_MARKER_END, HTML_MARKER_START, STATIC_MARKER } from './version.js';

function assertQuit(options) {
  if (options.force) return { checked: true, running: false, forced: true, pids: [] };
  const result = (options.processCheck ?? inspectCursorProcesses)();
  if (!result.checked) {
    throw new CliError(`无法确认 Cursor 是否在运行（${result.error || '进程检查失败'}）。完全退出后重试，或显式传入 --force。`);
  }
  if (result.running) {
    throw new CliError(`检测到 Cursor 正在运行（pid ${result.pids.join(', ')}）。请完全退出后再还原。`);
  }
  return result;
}

function glassHasStatic(glassPath) {
  if (!fs.existsSync(glassPath)) return false;
  const stat = fs.statSync(glassPath);
  const len = Math.min(stat.size, 240);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(glassPath, 'r');
  try {
    fs.readSync(fd, buf, 0, len, Math.max(0, stat.size - len));
  } finally {
    fs.closeSync(fd);
  }
  return buf.includes(STATIC_MARKER);
}

function describeMissingBackup(files, product, root) {
  const state = readState(files.state);
  let html = '';
  try {
    html = fs.readFileSync(files.html, 'utf8');
  } catch {
    html = '';
  }
  const hasStart = html.includes(HTML_MARKER_START);
  const incomplete = hasStart && !html.includes(HTML_MARKER_END);
  const staticPatch = Boolean(state && state.staticApplied) || glassHasStatic(files.glass);
  const happened = '上次恢复英文时，自动重新安装可能在写回文件之后又把汉化打了回去，然后备份被删掉了。';
  if (staticPatch) {
    return {
      reversible: false,
      message: [
        `找不到 ${product.version} (${product.commit}) 的原始备份。`,
        happened,
        '这份安装做过 Glass 静态替换，没有原件就没法保证完全回到英文。请重新安装 Cursor，再打开「Cursor 汉化」。',
        `备份目录: ${root}`,
      ].join('\n'),
    };
  }
  if (hasStart && !incomplete) {
    return {
      reversible: true,
      message: [
        `找不到 ${product.version} (${product.commit}) 的原始备份。`,
        happened,
        '界面注入还在，而且没有做过 Glass 静态替换，所以可以去掉界面注入，并按去掉之后的 workbench.html 重算 product.json 里的校验和。',
        '命令行请再运行一次 restore，并加上 --rebuild-without-backup。',
        `备份目录: ${root}`,
      ].join('\n'),
    };
  }
  const hint = state
    ? `状态文件记录的是 ${state.cursorVersion} (${state.cursorCommit})。`
    : '安装目录里也没有补丁状态。';
  const broken = incomplete ? 'workbench.html 的注入标记不完整，没法靠去掉注入来还原。' : 'workbench.html 里没有本工具的注入标记，没法靠去掉注入来还原。';
  return {
    reversible: false,
    message: [
      `找不到 ${product.version} (${product.commit}) 的原始备份。${hint}`,
      broken,
      '如果 Cursor 已经更新，旧版本的备份不会被写回新文件。要得到干净安装，请重新安装 Cursor。',
      `备份目录: ${root}`,
    ].join('\n'),
  };
}

function finishRestore(options, appPath, files, dataDir, actions, warnings) {
  chownInvokingUser([dataDir, path.dirname(files.state)], {
    getuid: options.getuid,
    env: options.env,
    chownSync: options.chownSync,
  });
  const signing = runMacPostProcess(appPath, {
    platform: options.platform,
    codesign: options.codesign !== false,
    clearQuarantine: options.clearQuarantine !== false,
    execFile: options.execFile,
  });
  if (signing.warnings) warnings.push(...signing.warnings);
  if (signing.entitlementsMissing || signing.codesignFailed) {
    throw new CliError(EMPTY_ENTITLEMENTS_MESSAGE);
  }
  if (signing.performed) {
    actions.push(`macOS: 已对 ${signing.bundle} 重新执行 ${signing.steps.map((step) => step.name).join('、')}`);
  }
  return { signing };
}

function rebuildInjection(options, appPath, files, product, dataDir, root) {
  const html = fs.readFileSync(files.html, 'utf8');
  let stripped;
  try {
    stripped = removeInjection(html);
  } catch {
    throw new CliError('workbench.html 的注入标记不完整，没有原始备份就没法安全还原。请重新安装 Cursor。');
  }
  if (!stripped.removed) {
    throw new CliError('workbench.html 里没有可以去掉的界面注入。');
  }
  const productRaw = fs.readFileSync(files.product, 'utf8');
  const parsed = JSON.parse(productRaw);
  let nextProduct = productRaw;
  let checksumUpdated = false;
  const oldHash = parsed.checksums && parsed.checksums[CHECKSUM_HTML];
  if (oldHash) {
    try {
      const updated = replaceChecksum(productRaw, CHECKSUM_HTML, oldHash, sha256Base64(stripped.html));
      nextProduct = updated.raw;
      checksumUpdated = updated.changed;
      JSON.parse(nextProduct);
    } catch (error) {
      const detail = error && error.message ? error.message : String(error);
      throw new CliError(`没法重算 product.json 里的校验和（${detail}）。原始备份已经不在，没有改动文件。请重新安装 Cursor。`);
    }
  }
  fs.writeFileSync(files.html, stripped.html);
  if (nextProduct !== productRaw) fs.writeFileSync(files.product, nextProduct);
  const actions = ['已去掉 workbench.html 里的界面注入（原始备份已经不在）'];
  if (checksumUpdated) actions.push('已按去掉注入后的 workbench.html 重算校验和');
  if (fs.existsSync(files.script)) {
    fs.rmSync(files.script);
    actions.push('已删除注入的 cursor-zh-hans.js');
  }
  removeState(files.state);
  actions.push('已清除补丁状态');
  const warnings = ['原始备份已经不在。这一步只去掉了界面注入，并重算了 workbench.html 的校验和。'];
  const { signing } = finishRestore(options, appPath, files, dataDir, actions, warnings);
  return {
    ok: true,
    appPath,
    product,
    backupRoot: root,
    actions,
    warnings,
    signing,
    rebuiltWithoutBackup: true,
  };
}

export function restore(options = {}) {
  const { appPath } = detectAppPath(options.appPath);
  const files = appFiles(appPath);
  const { json: product } = readProductFile(files.product);
  assertQuit(options);
  const dataDir = options.dataDir || userDataDir();
  const root = backupRootFor(dataDir, appPath, product);
  const manifest = readManifest(root);
  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    const missing = describeMissingBackup(files, product, root);
    if (missing.reversible && options.rebuildWithoutBackup) {
      return rebuildInjection(options, appPath, files, product, dataDir, root);
    }
    throw new CliError(missing.message);
  }

  const actions = [];
  for (const item of manifest.files) {
    const backed = backupFilePath(root, item.rel);
    if (!fs.existsSync(backed)) {
      throw new CliError(`备份清单包含 ${item.rel}，但文件不存在: ${backed}`);
    }
    const bytes = fs.readFileSync(backed);
    const hash = sha256Hex(bytes);
    if (item.sha256 && item.sha256 !== hash) {
      throw new CliError(`备份 ${item.rel} 的校验和与清单不一致，已停止还原。`);
    }
    const dest = path.join(files.root, item.rel);
    const mode = fs.statSync(backed).mode;
    fs.writeFileSync(dest, bytes);
    fs.chmodSync(dest, mode);
    actions.push(`已还原 ${item.rel}`);
  }

  if (fs.existsSync(files.script)) {
    fs.rmSync(files.script);
    actions.push('已删除注入的 cursor-zh-hans.js');
  }
  removeState(files.state);
  actions.push('已清除补丁状态');
  const warnings = [];
  const { signing } = finishRestore(options, appPath, files, dataDir, actions, warnings);

  return {
    ok: true,
    appPath,
    product,
    backupRoot: root,
    actions,
    warnings,
    signing,
  };
}
