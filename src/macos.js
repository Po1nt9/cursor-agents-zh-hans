import { execFileSync } from 'node:child_process';
import { macBundlePath } from './paths.js';

export function runMacPostProcess(appPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const bundle = options.bundlePath ?? macBundlePath(appPath);
  if (platform !== 'darwin') {
    return {
      performed: false,
      reason: 'not-darwin',
      bundle,
      steps: [],
    };
  }
  if (!bundle) {
    return {
      performed: false,
      reason: 'bundle-not-found',
      bundle: null,
      steps: [],
      warnings: ['未能从安装路径推断 Cursor.app，已跳过 codesign 与 quarantine。请确认 --app-path 指向 .app/Contents/Resources/app。'],
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
  if (options.codesign !== false) {
    try {
      execFile('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'pipe' });
      steps.push({ name: 'codesign', args: ['--force', '--deep', '--sign', '-', bundle] });
    } catch (error) {
      warnings.push(`ad-hoc 重签名失败（codesign）: ${error.message}。Apple Silicon 上未签名的改动可能被系统直接杀掉。`);
    }
  }
  return { performed: steps.length > 0, reason: 'darwin', bundle, steps, warnings };
}
