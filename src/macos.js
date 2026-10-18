import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { macBundlePath } from './paths.js';

// Ad-hoc main binary + hardened runtime rejects the Developer ID Electron Framework
// (SIGKILL, "different Team IDs"). Keep entitlements only. Do not pass --deep,
// and do not preserve flags or the Developer ID designated requirement.
export const CODESIGN_ARGS_PREFIX = ['--force', '--sign', '-', '--preserve-metadata=entitlements'];

export const EMPTY_ENTITLEMENTS_MESSAGE = [
  'macOS 重签名没有留下 entitlements，或 codesign 没有成功。',
  '界面文件已按备份还原。',
  '请重新安装 Cursor，恢复官方 Developer ID 和原来的 entitlements（allow-jit、Apple Events、麦克风、摄像头），然后再 apply。',
  '这一版只执行：codesign --force --sign - --preserve-metadata=entitlements <Cursor.app>',
  '不要加 --deep，也不要保留 flags 或 requirements。保留 flags 会让 ad-hoc 主程序带上 hardened runtime，启动时被系统 SIGKILL（Library not loaded: Electron Framework，Team ID 不一致）。',
].join('\n');

export function codesignArgs(bundle) {
  return [...CODESIGN_ARGS_PREFIX, bundle];
}

export function runMacPostProcess(appPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const bundle = options.bundlePath ?? macBundlePath(appPath);
  if (platform !== 'darwin') {
    return {
      performed: false,
      reason: 'not-darwin',
      bundle,
      steps: [],
      entitlementsMissing: false,
      codesignFailed: false,
    };
  }
  if (!bundle) {
    return {
      performed: false,
      reason: 'bundle-not-found',
      bundle: null,
      steps: [],
      warnings: ['未能从安装路径推断 Cursor.app，已跳过 codesign 与 quarantine。请确认 --app-path 指向 .app/Contents/Resources/app。'],
      entitlementsMissing: false,
      codesignFailed: false,
    };
  }
  const execFile = options.execFile ?? execFileSync;
  const steps = [];
  const warnings = [];
  if (options.clearQuarantine !== false) {
    try {
      execFile('xattr', ['-dr', 'com.apple.quarantine', bundle], { stdio: 'pipe' });
      steps.push({ name: 'xattr', args: ['-dr', 'com.apple.quarantine', bundle] });
    } catch (error) {
      warnings.push(`清除隔离属性失败（xattr）: ${error.message}`);
    }
  }
  let codesignFailed = false;
  let entitlementsMissing = false;
  if (options.codesign !== false) {
    const args = codesignArgs(bundle);
    try {
      execFile('codesign', args, { stdio: 'pipe' });
      steps.push({ name: 'codesign', args, preservedMetadata: true });
      const entitlements = readMacEntitlements(bundle, execFile);
      entitlementsMissing = Boolean(entitlements.missing);
      if (entitlements.reason === 'unknown') {
        warnings.push('未能读取 entitlements，没有把它当成空权限，也没有还原。');
      } else if (entitlementsMissing) {
        warnings.push('重签名之后没有读到 entitlements。');
      }
    } catch (error) {
      codesignFailed = true;
      warnings.push(`ad-hoc 重签名失败（codesign）: ${error.message}。没有改用会清掉权限的签名。Apple Silicon 上未签名的改动可能被系统直接杀掉。`);
    }
  }
  return {
    performed: steps.length > 0,
    reason: 'darwin',
    bundle,
    steps,
    warnings,
    entitlementsMissing,
    codesignFailed,
  };
}

function commandOutput(error) {
  return `${error && error.stdout ? error.stdout : ''}\n${error && error.stderr ? error.stderr : ''}\n${error && error.message ? error.message : ''}`;
}

function execResult(execFile, args) {
  if (execFile === execFileSync) {
    const result = spawnSync('codesign', args, { encoding: 'utf8' });
    return {
      ok: result.status === 0,
      text: `${result.stdout || ''}\n${result.stderr || ''}`,
    };
  }
  try {
    const out = execFile('codesign', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, text: String(out ?? '') };
  } catch (error) {
    return { ok: false, text: commandOutput(error) };
  }
}

function execText(execFile, args) {
  return execResult(execFile, args).text;
}

export function readMacEntitlements(bundle, execFile = execFileSync) {
  if (!bundle) return { checked: false, missing: false, reason: 'no-bundle' };
  const read = execResult(execFile, ['-d', '--entitlements', '-', '--xml', bundle]);
  const text = read.text;
  if (!read.ok) {
    if (/not signed|code object is not signed/i.test(text) && !/<key>/.test(text)) {
      return { checked: true, missing: true, reason: 'empty' };
    }
    return { checked: false, missing: false, reason: 'unknown' };
  }
  if (!text.trim()) return { checked: true, missing: true, reason: 'empty' };
  if (/no entitlements/i.test(text)) return { checked: true, missing: true, reason: 'empty' };
  const missing = !/<key>/.test(text) && !/\[Key\]/.test(text) && !/\[Dict\]/.test(text);
  return { checked: true, missing, reason: missing ? 'empty' : 'present' };
}

export function parseCodesignDisplay(text) {
  const blob = String(text || '');
  const flags = /flags=0x([0-9a-fA-F]+)(?:\(([^)]*)\))?/.exec(blob);
  const flagText = flags ? (flags[2] || '') : '';
  const flagBits = flags ? Number.parseInt(flags[1], 16) : 0;
  const runtime = /(?:^|[,\s])runtime(?:[,\s)]|$)/.test(flagText) || (flagBits & 0x10000) !== 0;
  const adhoc = /Signature=adhoc/i.test(blob) || /(?:^|[,\s])adhoc(?:[,\s)]|$)/.test(flagText);
  const team = /TeamIdentifier=([^\n\r]+)/.exec(blob);
  const teamId = team ? team[1].trim() : null;
  return { runtime, adhoc, teamId };
}

export function electronFrameworkPath(bundle) {
  if (!bundle) return null;
  return path.join(bundle, 'Contents', 'Frameworks', 'Electron Framework.framework');
}

export function readMacSigningHealth(bundle, execFile = execFileSync) {
  const entitlements = readMacEntitlements(bundle, execFile);
  if (!bundle) {
    return { checked: false, entitlements, hardenedAdhoc: false, teamMismatch: false, runtime: false };
  }
  const main = parseCodesignDisplay(execText(execFile, ['-dv', '--verbose=4', bundle]));
  const framework = parseCodesignDisplay(execText(execFile, ['-dv', '--verbose=4', electronFrameworkPath(bundle)]));
  const mainTeam = main.teamId;
  const frameworkTeam = framework.teamId;
  const teamMismatch = Boolean(mainTeam && frameworkTeam && mainTeam !== frameworkTeam);
  const hardenedAdhoc = Boolean(main.adhoc && main.runtime);
  return {
    checked: true,
    entitlements,
    main,
    framework,
    runtime: main.runtime,
    hardenedAdhoc,
    teamMismatch,
  };
}

export function formatSigningLines(health) {
  if (!health || !health.checked) return [];
  const lines = [];
  const crash = health.hardenedAdhoc || (health.teamMismatch && health.runtime);
  if (crash) {
    lines.push('当前签名会让 Cursor 在启动时被系统 SIGKILL（137）：Library not loaded: @rpath/Electron Framework.framework/Electron Framework，以及 mapping process and mapped file have different Team IDs。');
    if (health.hardenedAdhoc) {
      lines.push('主程序是 ad-hoc 签名，并且 flags 里还有 hardened runtime。ad-hoc 主程序不能带 runtime，否则会拒绝仍由 Developer ID 签名的 Electron Framework。');
    }
    if (health.teamMismatch) {
      lines.push(`主程序 Team ID 是 ${health.main.teamId}，Electron Framework 是 ${health.framework.teamId}。`);
    }
    lines.push('修复：用这一版重新执行 apply。它只运行 codesign --force --sign - --preserve-metadata=entitlements，不再 --deep，也不再保留 flags 和 requirements。');
    lines.push('如果 doctor 显示没有 entitlements，先重新安装 Cursor，再 apply。重装才能找回官方 Developer ID 和原来的四项权限。');
  } else if (health.teamMismatch) {
    lines.push(`主程序 Team ID 是 ${health.main.teamId}，Electron Framework 是 ${health.framework.teamId}。主程序没有 hardened runtime，这是只重签外壳之后的预期状态，可以启动。`);
  }
  if (health.entitlements && health.entitlements.missing) {
    lines.push('当前签名没有 entitlements。只有重新安装 Cursor 才能恢复 allow-jit、Apple Events、麦克风和摄像头。装好之后再 apply。');
  }
  return lines;
}

export function missingWriteAccess(appPath, options = {}) {
  const access = options.accessSync ?? fs.accessSync;
  const platform = options.platform ?? process.platform;
  const targets = [appPath];
  if (platform === 'darwin') {
    const bundle = options.bundlePath ?? macBundlePath(appPath);
    if (bundle && bundle !== appPath) targets.push(bundle);
  }
  return targets.filter((target) => {
    try {
      access(target, fs.constants.W_OK);
      return false;
    } catch {
      return true;
    }
  });
}

export function relaunchWithSudo(argv, execFile = execFileSync) {
  execFile('sudo', ['--', ...argv], { stdio: 'inherit' });
}
