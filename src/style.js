/**
 * zh-CN product-UI checks. See dictionary/STYLE.md.
 */

const HAN_LATIN = /[\u4e00-\u9fff][A-Za-z]|[A-Za-z][\u4e00-\u9fff]/;
const HALF_PUNCT = /[\u4e00-\u9fff]\s*[,:;!?]|[,:;!?]\s*[\u4e00-\u9fff]/;

function skipPunct(text) {
  return /https?:\/\/|\/[a-z][a-z0-9-]*|shift\+|Ctrl|Alt|Shift|⌘|⌥|⇧/.test(text);
}

export function lintChinese(english, chinese) {
  const issues = [];
  const en = String(english || '');
  const zh = String(chinese || '');
  if (!zh || !/[\u4e00-\u9fff]/.test(zh)) return issues;
  if (zh.includes('的的')) issues.push('stacked-de');
  if (/\bAgent\b/.test(en) && !/proxy/i.test(en) && zh.includes('代理')) issues.push('agent-as-proxy');
  if (/\b[Ss]teer\b/.test(en) && (zh.includes('引导') || !zh.includes('转向'))) issues.push('steer-calque');
  if (HAN_LATIN.test(zh) && !/\/[A-Za-z]/.test(zh)) issues.push('missing-space');
  if (!skipPunct(zh) && HALF_PUNCT.test(zh)) issues.push('halfwidth-punct');
  if (/[\u4e00-\u9fff]/.test(zh) && /[A-Za-z]{4,}/.test(zh)) {
    const leftovers = zh.match(/\b(?:Used|before|your|credits|Unable|Failed|Please|configuration|Restart)\b/);
    if (leftovers) issues.push('mixed-english');
  }
  return issues;
}

export function lintDictionary(raw) {
  const problems = [];
  const exact = raw && raw.exact ? raw.exact : {};
  for (const [en, zh] of Object.entries(exact)) {
    for (const issue of lintChinese(en, zh)) {
      problems.push({ kind: 'exact', id: en, issue });
    }
  }
  const regex = Array.isArray(raw && raw.regex) ? raw.regex : [];
  for (const entry of regex) {
    for (const issue of lintChinese(entry.pattern || '', entry.replacement || '')) {
      if (issue === 'steer-calque') continue;
      problems.push({ kind: 'regex', id: entry.id || entry.pattern, issue });
    }
  }
  return problems;
}
