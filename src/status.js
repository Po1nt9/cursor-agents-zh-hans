import fs from 'node:fs';
import { backupRootFor, readManifest, readState } from './backup.js';
import { sha256Base64 } from './checksum.js';
import { readMacEntitlements } from './macos.js';
import { appFiles, detectAppPath, macBundlePath, userDataDir } from './paths.js';
import { inspectCursorProcesses } from './process-check.js';
import { readProductFile } from './product.js';
import {
  CHECKSUM_DESKTOP,
  CHECKSUM_GLASS,
  CHECKSUM_HTML,
  HTML_MARKER_START,
  STATIC_MARKER,
  TOOL_VERSION,
} from './version.js';

function canWrite(appPath) {
  try {
    fs.accessSync(appPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function tailHas(file, marker) {
  if (!fs.existsSync(file)) return false;
  const stat = fs.statSync(file);
  const len = Math.min(stat.size, 240);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, len, Math.max(0, stat.size - len));
  } finally {
    fs.closeSync(fd);
  }
  return buf.includes(Buffer.from(marker));
}

export function inspectInstall(options = {}) {
  const detected = detectAppPath(options.appPath);
  const files = appFiles(detected.appPath);
  const { json: product } = readProductFile(files.product);
  const state = readState(files.state);
  const dataDir = options.dataDir || userDataDir();
  const backupRoot = backupRootFor(dataDir, detected.appPath, product);
  const manifest = readManifest(backupRoot);
  const html = fs.existsSync(files.html) ? fs.readFileSync(files.html, 'utf8') : '';
  const checksums = product.checksums || {};
  const htmlChecksummed = Object.prototype.hasOwnProperty.call(checksums, CHECKSUM_HTML);
  let htmlChecksumMatches = null;
  if (htmlChecksummed && html) {
    htmlChecksumMatches = sha256Base64(Buffer.from(html, 'utf8')) === checksums[CHECKSUM_HTML];
  }
  const running = (options.processCheck ?? inspectCursorProcesses)();
  return {
    toolVersion: TOOL_VERSION,
    appPath: detected.appPath,
    bundlePath: macBundlePath(detected.appPath),
    platform: options.platform ?? process.platform,
    product: {
      version: product.version,
      commit: product.commit,
      realCommit: product.realCommit || null,
      vscodeVersion: product.vscodeVersion || null,
      quality: product.quality || null,
    },
    checksums: {
      keys: Object.keys(checksums),
      html: htmlChecksummed,
      glass: Object.prototype.hasOwnProperty.call(checksums, CHECKSUM_GLASS),
      desktop: Object.prototype.hasOwnProperty.call(checksums, CHECKSUM_DESKTOP),
      htmlMatches: htmlChecksumMatches,
    },
    files: {
      html: fs.existsSync(files.html),
      glass: fs.existsSync(files.glass),
      desktop: fs.existsSync(files.desktop),
      script: fs.existsSync(files.script),
      injected: html.includes(HTML_MARKER_START),
      staticMarker: tailHas(files.glass, STATIC_MARKER),
    },
    state,
    backup: manifest
      ? { root: backupRoot, files: manifest.files.map((item) => item.rel) }
      : { root: backupRoot, files: [] },
    versionMismatch: Boolean(
      state && (state.cursorVersion !== product.version || state.cursorCommit !== product.commit),
    ),
    writable: canWrite(detected.appPath),
    running,
    entitlements: (options.platform ?? process.platform) === 'darwin'
      ? readMacEntitlements(macBundlePath(detected.appPath), options.execFile)
      : { checked: false, missing: false, reason: 'not-darwin' },
  };
}

export function formatStatus(report) {
  const lines = [
    `cursor-zh ${report.toolVersion}`,
    `安装目录: ${report.appPath}`,
    `Cursor ${report.product.version}  commit ${report.product.commit}`,
  ];
  if (report.product.realCommit && report.product.realCommit !== report.product.commit) {
    lines.push(`realCommit ${report.product.realCommit}（与 commit 不同，备份按 commit 区分）`);
  }
  lines.push(report.files.injected ? '注入: 已写入 workbench.html' : '注入: 未安装');
  lines.push(report.files.script ? '运行时: cursor-zh-hans.js 存在' : '运行时: 尚未写入');
  lines.push(report.files.staticMarker ? '静态替换: Glass 包带有标记' : '静态替换: 未打标');
  if (report.state) {
    lines.push(`状态: ${report.state.cursorVersion} / 校验和${report.state.checksumsUpdated ? '已更新' : '未更新'}`);
  } else {
    lines.push('状态: 无');
  }
  lines.push(report.backup.files.length ? `备份: ${report.backup.files.length} 个文件` : '备份: 当前版本无备份');
  if (report.running.checked) {
    lines.push(report.running.running ? `进程: Cursor 正在运行 (${report.running.pids.join(', ')})` : '进程: 未发现 Cursor 主进程');
  } else {
    lines.push('进程: 未能检查');
  }
  return lines.join('\n');
}

export function formatDoctor(report) {
  const lines = [formatStatus(report), ''];
  lines.push(`可写: ${report.writable ? '是' : '否（macOS 的 /Applications 可能需要 sudo）'}`);
  lines.push(`Glass 包: ${report.files.glass ? '存在' : '缺失'}`);
  lines.push(`经典窗口包: ${report.files.desktop ? '存在' : '缺失'}`);
  lines.push(`校验和条目 (${report.checksums.keys.length}):`);
  for (const key of report.checksums.keys) lines.push(`  - ${key}`);
  lines.push(`workbench.html 在校验和中: ${report.checksums.html ? '是' : '否'}`);
  lines.push(`workbench.glass.main.js 在校验和中: ${report.checksums.glass ? '是' : '否'}`);
  lines.push(`workbench.desktop.main.js 在校验和中: ${report.checksums.desktop ? '是' : '否'}`);
  if (report.checksums.htmlMatches === false) {
    lines.push('workbench.html 的内容与 product.json 校验和不一致。若未使用 --update-checksums，Cursor 可能提示安装已损坏 / [Unsupported]。');
  } else if (report.checksums.htmlMatches === true) {
    lines.push('workbench.html 与 product.json 中的校验和一致。');
  }
  lines.push('');
  lines.push('校验和只在传入 --update-checksums 时修改，且只改本次动过的文件。这不会关闭登录或付费检查。');
  lines.push('Glass 与经典窗口加载同一份 workbench.html；workbench.js 再按 glass 标志选择 glass 或 desktop 包。');
  lines.push('运行时用 MutationObserver 只处理新增或变化的节点，不用定时器扫整页。');
  lines.push('不翻译：代码编辑器、终端、差异内容、聊天消息 / 模型 Markdown、输入框。');
  if (report.versionMismatch) {
    lines.push('');
    lines.push(`版本不一致: 补丁状态是 ${report.state.cursorVersion} (${report.state.cursorCommit})，当前安装是 ${report.product.version} (${report.product.commit})。`);
    lines.push('若新文件已不含补丁标记，直接 apply 会备份新原件再打补丁。不要把旧备份写回新版本。');
  }
  lines.push('');
  if (report.platform === 'darwin') {
    lines.push(`macOS 应用包: ${report.bundlePath || '（未能推断）'}`);
    lines.push('修改 .app 后系统会认为签名失效。apply / restore 默认执行:');
    lines.push('  xattr -dr com.apple.quarantine <Cursor.app>');
    lines.push('  codesign --force --deep --preserve-metadata=entitlements,requirements,flags --sign - <Cursor.app>');
    lines.push('这是 ad-hoc 重签名，不是 Apple 开发者签名。它会换掉原来的 Developer ID 签名；要恢复官方签名，请重新安装 Cursor。');
    lines.push('签名时会尽量保留 entitlements、requirements 和 flags（包括 hardened runtime）。保留失败时才会退回不带这些元数据的签名。');
    if (report.entitlements && report.entitlements.missing) {
      lines.push('当前签名没有 entitlements。这是 codesign 修复之前的 v0.1 留下的：当时的 ad-hoc 重签名把原来的权限清掉了。');
      lines.push('只有重新安装 Cursor 才能恢复 entitlements 和 Developer ID 签名。装好之后再执行 apply。');
    } else if (report.entitlements && report.entitlements.reason === 'unavailable') {
      lines.push('未能读取 entitlements。若这台 Mac 在 codesign 修复前打过补丁，请重新安装 Cursor 后再 apply。');
    }
    lines.push('可用 --no-codesign 与 --no-clear-quarantine 跳过。Apple Silicon 上，未重签的修改版可能被系统直接结束进程。');
    lines.push('屏幕顶部的 macOS 菜单栏是系统原生菜单，这份补丁改不到。请从扩展市场安装 MS-CEINTL.vscode-language-pack-zh-hans。');
  } else {
    lines.push('当前不是 macOS，因此不会执行 codesign 或清除 quarantine。');
    lines.push('在 Mac 上，apply / restore 默认会 ad-hoc 重签名并清除隔离属性，可用 --no-codesign 与 --no-clear-quarantine 关闭。');
  }
  lines.push('');
  lines.push('VS Code 自带界面请从扩展市场安装中文语言包（MS-CEINTL.vscode-language-pack-zh-hans）。本仓库不附带该语言包。');
  return lines.join('\n');
}
