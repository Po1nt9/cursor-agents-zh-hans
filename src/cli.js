import fs from 'node:fs';
import { apply } from './apply.js';
import { CliError } from './errors.js';
import { restore } from './restore.js';
import { renderCoverageMarkdown } from './coverage.js';
import { formatScanReport, scanInstall } from './scan.js';
import { formatDoctor, formatStatus, inspectInstall } from './status.js';
import { TOOL_VERSION } from './version.js';

const HELP = `cursor-zh ${TOOL_VERSION}
非官方 Cursor 智能体窗口（Glass）简体中文补丁。只修改本机界面资源。

用法
  cursor-zh apply    [--app-path PATH] [--static] [--update-checksums]
  cursor-zh restore  [--app-path PATH]
  cursor-zh status   [--app-path PATH]
  cursor-zh doctor   [--app-path PATH]
  cursor-zh scan     [--app-path PATH] [--out FILE] [--bundles glass|desktop|both]

常用选项
  --app-path PATH          安装目录。可以是 resources/app，也可以是 Cursor.app
  --data-dir PATH          备份目录（默认在用户数据目录下的 cursor-zh-hans）
  --dictionary PATH        词典目录，默认使用仓库里的 dictionary/
  --static                 同时按规则替换 workbench.glass.main.js 里的字符串
  --update-checksums       仅更新本次改动且已列入 product.json 的校验和
  --no-codesign            macOS 上跳过 ad-hoc 重签名
  --no-clear-quarantine    macOS 上跳过 xattr 清除隔离属性
  --force                  Cursor 仍在运行时仍继续（不推荐）
  --bundles WHICH          scan 读取 glass、desktop 或 both（默认 both）
  --min-count N            scan 忽略出现次数低于 N 的字符串（默认 2）
  --limit N                scan 最多打印 N 条未收录字符串（默认 200，-1 为全部）
  --json                   status / doctor / scan 输出 JSON
  --out FILE               把 scan 报告写到文件（内容仍只是字符串列表）
  --coverage FILE          把分类覆盖率写成 Markdown（只有计数和界面字符串）

apply 和 restore 在检测到 Cursor 主进程时会拒绝执行。请完全退出，不要只 Reload Window。
`;

export function parseArgs(argv) {
  const opts = {
    command: argv[0] || 'help',
    appPath: null,
    dataDir: null,
    dictionaryDir: null,
    force: false,
    static: false,
    updateChecksums: false,
    codesign: true,
    clearQuarantine: true,
    out: null,
    coverage: null,
    limit: 200,
    minCount: 2,
    json: false,
    bundles: 'both',
    help: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => {
      const value = argv[i + 1];
      if (value == null || value.startsWith('--')) {
        throw new CliError(`缺少 ${arg} 的参数值`);
      }
      i += 1;
      return value;
    };
    switch (arg) {
      case '--app-path': opts.appPath = take(); break;
      case '--data-dir': opts.dataDir = take(); break;
      case '--dictionary': opts.dictionaryDir = take(); break;
      case '--out': opts.out = take(); break;
      case '--coverage': opts.coverage = take(); break;
      case '--limit': opts.limit = Number(take()); break;
      case '--min-count': opts.minCount = Number(take()); break;
      case '--bundles': opts.bundles = take(); break;
      case '--force': opts.force = true; break;
      case '--static': opts.static = true; break;
      case '--update-checksums': opts.updateChecksums = true; break;
      case '--no-codesign': opts.codesign = false; break;
      case '--no-clear-quarantine': opts.clearQuarantine = false; break;
      case '--json': opts.json = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      case '-v':
      case '--version': opts.command = 'version'; break;
      default:
        throw new CliError(`未知参数 ${arg}`);
    }
  }
  if (!['apply', 'restore', 'status', 'doctor', 'scan', 'help', 'version'].includes(opts.command)) {
    throw new CliError(`未知命令 ${opts.command}\n\n${HELP}`);
  }
  if (opts.bundles !== 'glass' && opts.bundles !== 'desktop' && opts.bundles !== 'both') {
    throw new CliError('--bundles 只能是 glass、desktop 或 both');
  }
  if (!Number.isFinite(opts.limit) || !Number.isFinite(opts.minCount)) {
    throw new CliError('--limit 和 --min-count 必须是数字');
  }
  return opts;
}

function printResult(result) {
  for (const line of result.actions || []) console.log(line);
  for (const line of result.warnings || []) console.warn(line);
}

export async function main(argv) {
  try {
    const opts = parseArgs(argv);
    if (opts.help || opts.command === 'help') {
      console.log(HELP);
      return 0;
    }
    if (opts.command === 'version') {
      console.log(TOOL_VERSION);
      return 0;
    }
    if (opts.command === 'apply') {
      const result = apply(opts);
      console.log(`已处理 Cursor ${result.product.version} (${result.product.commit})`);
      console.log(`安装目录: ${result.appPath}`);
      console.log(`备份: ${result.backupRoot}`);
      printResult(result);
      return 0;
    }
    if (opts.command === 'restore') {
      const result = restore(opts);
      console.log(`已还原 Cursor ${result.product.version} (${result.product.commit})`);
      printResult(result);
      console.log('界面文件已从备份写回。若还装了 VS Code 中文语言包，那是独立扩展，不受本次还原影响。');
      return 0;
    }
    if (opts.command === 'status' || opts.command === 'doctor') {
      const report = inspectInstall(opts);
      if (opts.json) console.log(JSON.stringify(report, null, 2));
      else console.log(opts.command === 'doctor' ? formatDoctor(report) : formatStatus(report));
      return 0;
    }
    const report = scanInstall(opts);
    if (opts.coverage) {
      fs.writeFileSync(opts.coverage, renderCoverageMarkdown(report.coverage, {
        version: report.version,
        previous: opts.previousCoverage || null,
      }));
    }
    const text = formatScanReport(report, opts);
    const body = opts.json ? JSON.stringify(report, null, 2) : text;
    if (opts.out) fs.writeFileSync(opts.out, `${body}\n`);
    else console.log(body);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      return error.exitCode;
    }
    console.error(error.stack || error.message);
    return 1;
  }
}
