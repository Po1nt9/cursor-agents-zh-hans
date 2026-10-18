/**
 * zh-CN product-UI checks. See dictionary/STYLE.md.
 */

const HAN_LATIN = /[\u4e00-\u9fff][A-Za-z]|[A-Za-z][\u4e00-\u9fff]/;
const HALF_PUNCT = /[\u4e00-\u9fff]\s*[,:;!?]|[,:;!?]\s*[\u4e00-\u9fff]/;
const DATE_SPACE = /\d 月|\d 年|月 \d|月 \$|\$\d+ 日|\d 日|[\u4e00-\u9fff] \d+月|[\u4e00-\u9fff] \d+年/;
const HALF_PAREN = /[\u4e00-\u9fff][ \t]*\(|\([\u4e00-\u9fff]|[\u4e00-\u9fff][ \t]*\)|\)[ \t]*[\u4e00-\u9fff]/;
const CODE_CALL = /\$\([^)\n]*\)|\b[\w$]+(?:\.[\w$]+)+\([^)\n]*\)|\b[A-Za-z_][\w$]*\([^)\n]*\)|\(\d+,\s*\d+\)/g;
const FULLWIDTH_CODE = /\$（[^）\n]*）|(?<![0-9.])[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*（[^）\n]*）|（\s*\d+\s*[,，]\s*\d+\s*）/;

function skipPunct(text) {
  return /https?:\/\/|\/[a-z][a-z0-9-]*|shift\+|Ctrl|Alt|Shift|⌘|⌥|⇧/.test(text);
}

// AI prompt noun. Dialog, auth, and "when prompted" stay 提示.
export function promptNoun(english) {
  const en = String(english || '');
  if (!/\bprompts?\b/i.test(en)) return false;
  if (/\bprompted\b/i.test(en)) return false;
  if (/when prompted/i.test(en)) return false;
  // "will prompt" / "prompt before" is the verb, not the noun 提示词.
  if (/\b(will|would|won't|to|not|before|after)\s+prompt\b/i.test(en)) return false;
  if (/\bprompt before\b/i.test(en)) return false;
  if (/authentication prompts?/i.test(en)) return false;
  if (/skip prompts?/i.test(en)) return false;
  if (/connection prompt/i.test(en)) return false;
  if (/approval prompt/i.test(en)) return false;
  if (/github prompt/i.test(en)) return false;
  if (/never show/i.test(en)) return false;
  return true;
}

// Creating a pull request. Viewing an existing one stays 打开.
export function createsPullRequest(english) {
  const en = String(english || '').trim();
  if (/^(?:\^)?Open PR\$?$/i.test(en)) return false;
  if (/open PR page|Opened pull request|Open pull request in browser|Open pull request links|Open Pull Request Externally|Reopen PR|reopen pull request/i.test(en)) {
    return false;
  }
  if (/\bopen(?:ing|s|ed)?\b[^.\n]{0,80}\bPRs?\b/i.test(en)) return true;
  if (/\bopen(?:ing|s|ed)?\b[^.\n]{0,80}\bpull requests?\b/i.test(en)) return true;
  return false;
}

export function scheduledPhrase(english) {
  return /on a schedule|scheduled basis|on a scheduled/i.test(String(english || ''));
}

function bareTip(text) {
  return text.replace(/提示词/g, '').replace(/提示音/g, '').includes('提示');
}

export function lintChinese(english, chinese) {
  const issues = [];
  const en = String(english || '');
  const zh = String(chinese || '');
  if (!zh || !/[\u4e00-\u9fff]/.test(zh)) return issues;
  if (zh.includes('的的')) issues.push('stacked-de');
  if (/\bAgent\b/.test(en) && !/proxy/i.test(en) && zh.includes('代理')) issues.push('agent-as-proxy');
  if (/\b[Ss]teer\b/.test(en) && (zh.includes('引导') || zh.includes('转向'))) issues.push('steer-calque');
  if (HAN_LATIN.test(zh) && !/\/[A-Za-z]/.test(zh)) issues.push('missing-space');
  if (!skipPunct(zh) && HALF_PUNCT.test(zh)) issues.push('halfwidth-punct');
  if (/[\u4e00-\u9fff]/.test(zh) && /[A-Za-z]{4,}/.test(zh)) {
    const leftovers = zh.match(/\b(?:Used|before|your|credits|Unable|Failed|Please|configuration|Restart)\b/);
    if (leftovers) issues.push('mixed-english');
  }
  if (zh.includes('编写器')) issues.push('composer-calque');
  if (promptNoun(en) && !zh.includes('提示词')) issues.push('prompt-calque');
  if (promptNoun(en) && bareTip(zh) && en !== 'Prompt') issues.push('prompt-calque');
  if (/分拣|分流/.test(zh)) issues.push('triage-calque');
  if (scheduledPhrase(en) && zh.includes('按计划')) issues.push('schedule-calque');
  if (/Background Agents?/i.test(en) && zh.includes('后台智能体')) issues.push('background-agent');
  if (zh.includes('磁贴')) issues.push('tile-calque');
  if (DATE_SPACE.test(zh)) issues.push('date-space');
  if (/(?<!边)侧栏/.test(zh)) issues.push('synonym-sidebar');
  if (/认证/.test(zh)) issues.push('synonym-auth');
  if (zh.includes('仪表板')) issues.push('synonym-dashboard');
  if (zh.includes('这台电脑') || zh.includes('此计算机')) issues.push('synonym-computer');
  if (/按键绑定|(?<!盘)键绑定/.test(zh)) issues.push('synonym-keybinding');
  if (zh.includes('提供方')) issues.push('synonym-provider');
  if (zh.includes('存储库')) issues.push('synonym-repo');
  if (zh.includes('置顶')) issues.push('synonym-pin');
  if (zh.includes('未能')) issues.push('failure-prefix');
  if (/^(\^)?Failed to save\b/i.test(en) && !zh.startsWith('无法保存')) issues.push('save-prefix');
  if (createsPullRequest(en) && /打开 PR|打开拉取请求/.test(zh)) issues.push('open-pr');
  if (/「|」/.test(zh)) issues.push('corner-quotes');
  if (/[\u4e00-\u9fff]/.test(zh)) {
    const stripped = zh.replace(/[A-Za-z]'[A-Za-z]/g, '');
    if (stripped.includes('"') || stripped.includes("'")) issues.push('ascii-quotes');
  }
  if (FULLWIDTH_CODE.test(zh)) issues.push('fullwidth-code-paren');
  const prose = zh.replace(CODE_CALL, ' ');
  if (HALF_PAREN.test(prose)) issues.push('halfwidth-paren');
  if (/由于[^。]{0,160}因此/.test(zh)) issues.push('stiff-yinci');
  if (/进行比较|进行查找|进行导航/.test(zh)) issues.push('stiff-jinxing');
  if (/\btabs?\b/i.test(en) && !/\b(tags?|labels?)\b/i.test(en) && /标签(?!页)/.test(zh)) issues.push('tab-vs-label');
  if (/\b(tags?|labels?)\b/i.test(en) && !/\btabs?\b/i.test(en) && zh.includes('标签页')) issues.push('label-as-tab');
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
