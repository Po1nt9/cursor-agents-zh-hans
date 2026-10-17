import fs from 'node:fs';
import path from 'node:path';
import {
  backupFilePath,
  backupRootFor,
  readManifest,
  readState,
  removeState,
} from './backup.js';
import { sha256Hex } from './checksum.js';
import { CliError } from './errors.js';
import { runMacPostProcess } from './macos.js';
import { appFiles, detectAppPath, userDataDir } from './paths.js';
import { inspectCursorProcesses } from './process-check.js';
import { readProductFile } from './product.js';

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

export function restore(options = {}) {
  const { appPath } = detectAppPath(options.appPath);
  const files = appFiles(appPath);
  const { json: product } = readProductFile(files.product);
  assertQuit(options);
  const dataDir = options.dataDir || userDataDir();
  const root = backupRootFor(dataDir, appPath, product);
  const manifest = readManifest(root);
  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    const state = readState(files.state);
    const hint = state
      ? `状态文件记录的是 ${state.cursorVersion} (${state.cursorCommit})。`
      : '安装目录里也没有补丁状态。';
    throw new CliError(`找不到 ${product.version} (${product.commit}) 的原始备份。${hint}\n备份目录: ${root}\n如果 Cursor 已经更新，旧版本的备份不会被写回新文件。要得到干净安装，请重新安装 Cursor。`);
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
  const signing = runMacPostProcess(appPath, {
    platform: options.platform,
    codesign: options.codesign !== false,
    clearQuarantine: options.clearQuarantine !== false,
    execFile: options.execFile,
  });
  if (signing.warnings) warnings.push(...signing.warnings);
  if (signing.performed) {
    actions.push(`macOS: 已对 ${signing.bundle} 重新执行 ${signing.steps.map((step) => step.name).join('、')}`);
  }

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
