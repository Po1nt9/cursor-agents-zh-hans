import fs from 'node:fs';
import path from 'node:path';
import {
  backupRootFor,
  ensureBackupBytes,
  ensureManifest,
  readBackupBytes,
  readState,
  recordBackup,
  writeManifest,
  writeState,
} from './backup.js';
import { replaceChecksum, sha256Base64, sha256Hex } from './checksum.js';
import { loadDictionary, loadStaticRules } from './dictionary.js';
import { CliError } from './errors.js';
import { injectHtml } from './html-inject.js';
import { runMacPostProcess } from './macos.js';
import { appFiles, detectAppPath, userDataDir } from './paths.js';
import { inspectCursorProcesses } from './process-check.js';
import { readProductFile } from './product.js';
import { buildRuntimeScript } from './runtime.js';
import { applyStaticReplacements, withStaticMarker } from './static-replace.js';
import { assertJavaScriptSyntax } from './syntax.js';
import {
  CHECKSUM_GLASS,
  CHECKSUM_HTML,
  REL_GLASS,
  REL_HTML,
  REL_PRODUCT,
  STATIC_MARKER,
  TOOL_VERSION,
} from './version.js';

function assertQuit(options) {
  if (options.force) {
    return { checked: true, running: false, forced: true, pids: [] };
  }
  const result = (options.processCheck ?? inspectCursorProcesses)();
  if (!result.checked) {
    throw new CliError(`无法确认 Cursor 是否在运行（${result.error || '进程检查失败'}）。完全退出 Cursor 后重试，或显式传入 --force。`);
  }
  if (result.running) {
    throw new CliError(
      `检测到 Cursor 正在运行（pid ${result.pids.join(', ')}）。请完全退出后再打补丁；只执行 Reload Window 不够，主进程仍会占用这些文件。`,
    );
  }
  return result;
}

function assertWritable(appPath) {
  try {
    fs.accessSync(appPath, fs.constants.W_OK);
  } catch {
    throw new CliError(`没有写入权限: ${appPath}\nmacOS 上如果 Cursor 装在 /Applications，请用 sudo 重新运行。本工具不会自行提权。`);
  }
}

function readOriginal(root, rel, livePath, marker) {
  const backed = readBackupBytes(root, rel);
  if (backed) return backed;
  if (!fs.existsSync(livePath)) {
    throw new CliError(`缺少文件: ${livePath}`);
  }
  const current = fs.readFileSync(livePath);
  if (marker && current.includes(Buffer.from(marker))) {
    throw new CliError(
      `${rel} 已有本工具的补丁标记，但当前版本没有原始备份。为避免把已修改文件当成原件，已停止。请重新安装 Cursor，或从备份目录手工还原后再运行 apply。`,
    );
  }
  return current;
}

function writeIfChanged(file, bytes, mode) {
  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file);
    if (current.equals(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes))) return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  if (mode != null) fs.chmodSync(file, mode);
  return true;
}

function fileMode(file) {
  return fs.existsSync(file) ? fs.statSync(file).mode : 0o644;
}

function checksumWarning(key) {
  return [
    `警告: ${key} 在 product.json 的 checksums 里。`,
    '本次没有修改校验和（需要显式传入 --update-checksums）。',
    'Cursor 启动后可能提示安装已损坏或显示 [Unsupported]。',
    '这只影响完整性提示，不会绕过登录、授权或付费。',
  ].join('\n');
}

function formatMismatch(reports) {
  const lines = reports
    .filter((item) => item.status === 'mismatch' || item.status === 'mismatch-during-apply' || item.status === 'invalid')
    .map((item) => `  - ${item.id}: 期望 ${item.expected} 处，实际 ${item.actual}`);
  return `静态替换命中次数与词典不符，已放弃修改 workbench.glass.main.js（文件保持原样）:\n${lines.join('\n')}\n请运行 scan 查看漂移，并更新 dictionary/static-glass.json 里该版本的 expectedHits。`;
}

export function apply(options = {}) {
  const { appPath } = detectAppPath(options.appPath);
  assertWritable(appPath);
  const running = assertQuit(options);
  const files = appFiles(appPath);
  const { raw: productRaw, json: product } = readProductFile(files.product);
  const dictionaryDir = options.dictionaryDir;
  const { raw: dictionaryRaw } = loadDictionary(dictionaryDir);
  const dataDir = options.dataDir || userDataDir();
  const root = backupRootFor(dataDir, appPath, product);
  const warnings = [];
  const actions = [];

  const state = readState(files.state);
  if (state && (state.cursorVersion !== product.version || state.cursorCommit !== product.commit)) {
    const htmlNow = fs.existsSync(files.html) ? fs.readFileSync(files.html, 'utf8') : '';
    const glassNow = fs.existsSync(files.glass) ? fs.readFileSync(files.glass, 'utf8') : '';
    if (htmlNow.includes('cursor-zh-hans:start') || glassNow.includes(STATIC_MARKER)) {
      throw new CliError(
        `检测到 Cursor 已从 ${state.cursorVersion} (${state.cursorCommit}) 变为 ${product.version} (${product.commit})，但补丁标记还在。请先 restore 对应旧版本，不要把旧补丁覆盖到新文件上。`,
      );
    }
    warnings.push(
      `检测到 Cursor 已从 ${state.cursorVersion} (${state.cursorCommit}) 更新到 ${product.version} (${product.commit})。将备份新版本原件并重新打补丁。旧备份已保留。`,
    );
  }

  const htmlMode = fileMode(files.html);
  const htmlOriginal = readOriginal(root, REL_HTML, files.html, 'cursor-zh-hans:start');
  const htmlInjected = injectHtml(htmlOriginal.toString('utf8'));
  const htmlPatched = Buffer.from(htmlInjected.html, 'utf8');

  let glassPatched = null;
  let staticReports = [];
  if (options.static) {
    if (!fs.existsSync(files.glass)) {
      throw new CliError(`找不到 Glass 包: ${files.glass}`);
    }
    const glassOriginal = readOriginal(root, REL_GLASS, files.glass, STATIC_MARKER);
    const rules = loadStaticRules(dictionaryDir);
    const result = applyStaticReplacements(glassOriginal.toString('utf8'), rules.rules, product.version);
    staticReports = result.reports;
    if (!result.ok) {
      throw new CliError(formatMismatch(result.reports), 2);
    }
    if (result.changed) {
      const marked = withStaticMarker(result.source);
      assertJavaScriptSyntax(marked, 'workbench.glass.main.js');
      glassPatched = Buffer.from(marked, 'utf8');
    } else {
      warnings.push(`静态规则没有产生修改（版本 ${product.version} 可能没有填写 expectedHits）。Glass 包保持原样。`);
    }
  }

  const runtime = buildRuntimeScript(dictionaryRaw, TOOL_VERSION);
  assertJavaScriptSyntax(runtime, 'cursor-zh-hans.js');
  const runtimeBytes = Buffer.from(runtime, 'utf8');

  const checksumPlan = [];
  if (!htmlOriginal.equals(htmlPatched) && product.checksums && Object.prototype.hasOwnProperty.call(product.checksums, CHECKSUM_HTML)) {
    if (options.updateChecksums) {
      checksumPlan.push({ key: CHECKSUM_HTML, bytes: htmlPatched });
    } else {
      warnings.push(checksumWarning(CHECKSUM_HTML));
    }
  }
  if (glassPatched && product.checksums && Object.prototype.hasOwnProperty.call(product.checksums, CHECKSUM_GLASS)) {
    if (options.updateChecksums) {
      checksumPlan.push({ key: CHECKSUM_GLASS, bytes: glassPatched });
    } else {
      warnings.push(checksumWarning(CHECKSUM_GLASS));
    }
  }

  let productOriginal = null;
  let productPatched = null;
  if (checksumPlan.length > 0) {
    productOriginal = readOriginal(root, REL_PRODUCT, files.product, null);
    let next = productOriginal.toString('utf8');
    const parsedOriginal = JSON.parse(next);
    for (const item of checksumPlan) {
      const oldHash = parsedOriginal.checksums?.[item.key];
      if (!oldHash) {
        throw new CliError(`原版 product.json 的 checksums 不含 ${item.key}`);
      }
      const updated = replaceChecksum(next, item.key, oldHash, sha256Base64(item.bytes));
      next = updated.raw;
    }
    productPatched = Buffer.from(next, 'utf8');
    JSON.parse(next);
  }

  const manifest = ensureManifest(root, product, appPath);
  const htmlBackup = ensureBackupBytes(root, REL_HTML, htmlOriginal, htmlMode);
  recordBackup(manifest, REL_HTML, htmlBackup.sha256);
  if (htmlBackup.created) actions.push(`已备份 ${REL_HTML}`);

  if (glassPatched) {
    const existingGlassBackup = readBackupBytes(root, REL_GLASS);
    const glassSource = existingGlassBackup || fs.readFileSync(files.glass);
    const glassBackup = ensureBackupBytes(root, REL_GLASS, glassSource, fileMode(files.glass));
    recordBackup(manifest, REL_GLASS, glassBackup.sha256);
    if (glassBackup.created) actions.push(`已备份 ${REL_GLASS}`);
  }

  if (productOriginal) {
    const productBackup = ensureBackupBytes(root, REL_PRODUCT, productOriginal, fileMode(files.product));
    recordBackup(manifest, REL_PRODUCT, productBackup.sha256);
    if (productBackup.created) actions.push(`已备份 ${REL_PRODUCT}`);
  }
  writeManifest(root, manifest);

  if (writeIfChanged(files.html, htmlPatched, htmlMode)) {
    actions.push(htmlInjected.already ? '已刷新 workbench.html 注入' : '已向 workbench.html 注入运行时脚本');
  } else {
    actions.push('workbench.html 已是当前补丁');
  }
  if (writeIfChanged(files.script, runtimeBytes, 0o644)) {
    actions.push(`已写入 ${path.basename(files.script)}`);
  }
  if (glassPatched && writeIfChanged(files.glass, glassPatched, fileMode(files.glass))) {
    const applied = staticReports.filter((item) => item.status === 'ready').length;
    actions.push(`已静态替换 Glass 包中的 ${applied} 条字符串，并通过 node --check`);
  }
  if (productPatched && writeIfChanged(files.product, productPatched, fileMode(files.product))) {
    actions.push(`已更新 product.json 中 ${checksumPlan.length} 个校验和`);
  }

  const fileState = {
    [REL_HTML]: { originalSha256: sha256Hex(htmlOriginal), patchedSha256: sha256Hex(htmlPatched) },
  };
  if (glassPatched) {
    const glassOriginalBytes = readBackupBytes(root, REL_GLASS);
    fileState[REL_GLASS] = {
      originalSha256: sha256Hex(glassOriginalBytes),
      patchedSha256: sha256Hex(glassPatched),
    };
  }
  if (productPatched) {
    fileState[REL_PRODUCT] = {
      originalSha256: sha256Hex(productOriginal),
      patchedSha256: sha256Hex(productPatched),
    };
  }

  const glassStillPatched = Boolean(glassPatched) || (!options.static && tailHas(files.glass, STATIC_MARKER));
  let checksumsUpdated = Boolean(productPatched);
  if (!checksumsUpdated && state?.checksumsUpdated) {
    const backedProduct = readBackupBytes(root, REL_PRODUCT);
    if (backedProduct && !backedProduct.equals(Buffer.from(productRaw, 'utf8'))) checksumsUpdated = true;
  }

  writeState(files.state, {
    toolVersion: TOOL_VERSION,
    cursorVersion: product.version,
    cursorCommit: product.commit,
    realCommit: product.realCommit || null,
    appPath,
    appliedAt: new Date().toISOString(),
    injection: true,
    staticApplied: glassStillPatched,
    checksumsUpdated,
    files: fileState,
  });
  actions.push('已记录补丁状态');

  const signing = runMacPostProcess(appPath, {
    platform: options.platform,
    codesign: options.codesign !== false,
    clearQuarantine: options.clearQuarantine !== false,
    execFile: options.execFile,
  });
  if (signing.warnings) warnings.push(...signing.warnings);
  if (signing.performed) {
    actions.push(`macOS: 已对 ${signing.bundle} 执行 ${signing.steps.map((step) => step.name).join('、')}`);
  } else if (signing.reason === 'not-darwin') {
    actions.push('当前不是 macOS，已跳过 codesign 与 quarantine。在 Mac 上这两步默认开启，可用 --no-codesign 与 --no-clear-quarantine 关闭。');
  }

  return {
    ok: true,
    appPath,
    product,
    backupRoot: root,
    warnings,
    actions,
    running,
    signing,
    checksumsUpdated,
    staticApplied: glassStillPatched,
  };
}

function tailHas(file, marker) {
  if (!fs.existsSync(file)) return false;
  const stat = fs.statSync(file);
  const len = Math.min(stat.size, 240);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, len, stat.size - len);
  } finally {
    fs.closeSync(fd);
  }
  return buf.includes(marker);
}
