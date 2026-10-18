import fs from 'node:fs';
import { extractCoverageCandidates, summarizeCoverage } from './coverage.js';
import { loadDictionary, loadStaticRules } from './dictionary.js';
import { appFiles, detectAppPath } from './paths.js';
import { readProductFile } from './product.js';
import { countQuotedLiteral } from './static-replace.js';

export function extractUiStrings(source) {
  const counts = new Map();
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('"', index);
    if (start < 0) break;
    let cursor = start + 1;
    let text = '';
    let closed = false;
    while (cursor < source.length && text.length <= 120) {
      const ch = source[cursor];
      if (ch === '\\') {
        const next = source[cursor + 1];
        if (next == null) break;
        text += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
        cursor += 2;
        continue;
      }
      if (ch === '"') {
        closed = true;
        break;
      }
      text += ch;
      cursor += 1;
    }
    if (closed && text.length >= 1 && text.length <= 120 && isCandidate(text)) {
      counts.set(text, (counts.get(text) || 0) + 1);
    }
    // The closing quote can be the opening quote of the next literal (`","`).
    index = closed ? cursor : start + 1;
  }
  return counts;
}

export function isCandidate(text) {
  if (typeof text !== 'string') return false;
  if (text.length < 2 || text.length > 90) return false;
  if (!/^[A-Za-z0-9]/.test(text)) return false;
  if (!/[a-z]/.test(text)) return false;
  if (/https?:|[{}<>\\]|\/\*|\.js\b|node_modules/.test(text)) return false;
  const letters = text.match(/[A-Za-z]/g);
  if (!letters || letters.length / text.length < 0.55) return false;
  if (!/^[A-Z]/.test(text)) return false;
  if (!text.includes(' ') && /[a-z][A-Z]/.test(text)) return false;
  return true;
}

export function mergeCounts(maps) {
  const merged = new Map();
  for (const counts of maps) {
    for (const [text, count] of counts) {
      merged.set(text, (merged.get(text) || 0) + count);
    }
  }
  return merged;
}

export function diffAgainstDictionary(counts, compiled) {
  const missing = [];
  for (const [text, count] of counts) {
    if (!compiled.exact.has(text)) missing.push({ text, count });
  }
  missing.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  const stale = [];
  for (const key of compiled.exact.keys()) {
    if (!counts.has(key)) stale.push(key);
  }
  stale.sort((a, b) => a.localeCompare(b));
  return { missing, stale };
}

function readBundle(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

export function scanSources(sources, compiled, staticRules, version) {
  const counts = mergeCounts(sources.map((item) => extractUiStrings(item.source)));
  const diff = diffAgainstDictionary(counts, compiled);
  const glass = sources.find((item) => item.id === 'glass');
  const staticDrift = (staticRules?.rules || []).map((rule) => {
    const expected = rule.expectedHits ? rule.expectedHits[version] : undefined;
    const actual = glass ? countQuotedLiteral(glass.source, rule.literal, rule.context) : null;
    let status = 'ok';
    if (!glass) status = 'glass-missing';
    else if (expected == null) status = 'no-count';
    else if (actual !== expected) status = 'mismatch';
    return {
      id: rule.id,
      literal: rule.literal,
      expected: expected ?? null,
      actual,
      status,
    };
  });
  return {
    version,
    extracted: counts.size,
    missing: diff.missing,
    stale: diff.stale,
    staticDrift,
    dictionarySize: compiled.exact.size,
  };
}

export function scanInstall(options = {}) {
  const { appPath } = detectAppPath(options.appPath);
  const files = appFiles(appPath);
  const { json: product } = readProductFile(files.product);
  const { compiled } = loadDictionary(options.dictionaryDir);
  const staticRules = loadStaticRules(options.dictionaryDir);
  const which = options.bundles || 'both';
  const sources = [];
  if (which === 'glass' || which === 'both') {
    const source = readBundle(files.glass);
    if (source) sources.push({ id: 'glass', source });
  }
  if (which === 'desktop' || which === 'both') {
    const source = readBundle(files.desktop);
    if (source) sources.push({ id: 'desktop', source });
  }
  if (sources.length === 0) {
    throw new Error('没有可读的 workbench 包。');
  }
  const report = scanSources(sources, compiled, staticRules, product.version);
  const candidates = sources.flatMap((item) => extractCoverageCandidates(item.source, { bundle: item.id }));
  const coverage = summarizeCoverage(candidates, compiled);
  return {
    ...report,
    appPath,
    bundles: sources.map((item) => item.id),
    coverage,
  };
}

export function formatScanReport(report, options = {}) {
  const limit = options.limit == null ? 200 : options.limit;
  const minCount = options.minCount == null ? 2 : options.minCount;
  const missing = report.missing.filter((item) => item.count >= minCount);
  const shown = limit < 0 ? missing : missing.slice(0, limit);
  const mismatches = report.staticDrift.filter((item) => item.status === 'mismatch');
  const lines = [
    `扫描 ${report.appPath || ''}`.trim(),
    `Cursor ${report.version}  包: ${report.bundles.join(', ')}`,
    `候选英文字符串 ${report.extracted} 条，词典 exact ${report.dictionarySize} 条`,
    `未收录（出现次数 ≥ ${minCount}）: ${missing.length} 条，下面显示 ${shown.length} 条`,
    '',
  ];
  for (const item of shown) {
    lines.push(`${String(item.count).padStart(4)}  ${item.text}`);
  }
  if (shown.length < missing.length) {
    lines.push(`…… 另有 ${missing.length - shown.length} 条。提高 --limit 可继续列出。`);
  }
  lines.push('');
  lines.push(`词典中有 ${report.stale.length} 条没有以完整字符串出现在所扫描的包里（可能是运行时拼接，或来自另一窗口）。`);
  if (report.stale.length > 0) {
    const staleShown = report.stale.slice(0, 40);
    for (const text of staleShown) lines.push(`  ? ${text}`);
    if (report.stale.length > staleShown.length) {
      lines.push(`  …… 另有 ${report.stale.length - staleShown.length} 条`);
    }
  }
  lines.push('');
  if (report.coverage) {
    const covered = report.coverage;
    lines.push(`界面覆盖: ${covered.translated}/${covered.total}（${covered.total ? Math.round((covered.translated / covered.total) * 1000) / 10 : 0}%）。分类明细用 --coverage 写成 Markdown。`);
    lines.push('');
  }
  lines.push(`静态规则漂移: ${mismatches.length} 条命中次数与 ${report.version} 的 expectedHits 不一致。`);
  for (const item of mismatches) {
    lines.push(`  ! ${item.id}: 期望 ${item.expected}，实际 ${item.actual}  (${item.literal})`);
  }
  lines.push('以上只是字符串列表，不是 Cursor 源码。请不要把 bundle 提交进仓库。');
  return lines.join('\n');
}
