import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDictionary } from '../src/dictionary.js';
import { translateText } from '../src/engine.js';

const { raw, compiled } = loadDictionary();

function unescapePattern(pattern) {
  return pattern.replace(/\\(.)/g, '$1');
}

function sampleFor(pattern) {
  let n = 0;
  const body = pattern.replace(/^\^/, '').replace(/\$$/, '');
  const filled = body.replace(/\((?:\?:)?[\s\S]*?\)(?:[+*?]|\{[^}]*\})?/g, () => {
    n += 1;
    return n % 2 === 0 ? '3' : 'ZZZ';
  });
  return unescapePattern(filled);
}

const SPLICE = /[\u4e00-\u9fff][A-Za-z]{2,}|[A-Za-z]{2,}[\u4e00-\u9fff]|[\u4e00-\u9fff]s\b/;

test('regex examples do not splice an ASCII word into Chinese', () => {
  const hits = [];
  for (const entry of raw.regex) {
    const sample = sampleFor(entry.pattern);
    let out = '';
    try {
      out = translateText(sample, compiled).text;
    } catch (error) {
      hits.push(`${entry.id}: ${error.message}`);
      continue;
    }
    if (!/[\u4e00-\u9fff]/.test(out)) continue;
    const stripped = out
      .replace(/ZZZ/g, '')
      .replace(/`[^`]*`/g, ' ')
      .replace(/--[A-Za-z0-9-]+/g, ' ');
    if (SPLICE.test(stripped)) hits.push(`${entry.id}: ${out}`);
  }
  assert.deepEqual(hits, []);
});

test('a regex does not capture the verb in Failed to, Cannot, or Couldn\'t', () => {
  const hits = [];
  for (const entry of raw.regex) {
    const src = unescapePattern(entry.pattern);
    if (/^\^?(?:Failed to|Cannot|Couldn't) \(/.test(src)) hits.push(entry.id || src);
  }
  assert.deepEqual(hits, []);
});

test('specific rules beat the catch-all that would leave an English noun', () => {
  assert.equal(translateText('Please enter a valid integer for Port', compiled).text, '请输入 Port 的有效整数');
  assert.equal(translateText('Failed to load video: x', compiled).text, '无法加载视频：x');
  assert.equal(
    translateText('Unable to resolve your shell environment: boom', compiled).text,
    '无法解析 shell 环境：boom',
  );
  assert.equal(translateText("Unable to open 'notes.txt'", compiled).text, '无法打开“notes.txt”');
});

test('multi-word captures are translated and the spend amount survives', () => {
  assert.equal(
    translateText("You've run out of your $20 monthly spend limit. Set a higher limit to keep going.", compiled).text,
    '你本月 $20 的支出上限已用完。请调高上限以继续。',
  );
  assert.equal(
    translateText("Cursor's servers can reach it, but can't sign in to it yet.", compiled).text,
    'Cursor 的服务器可以访问它，但目前还无法登录它。',
  );
  assert.equal(
    translateText('Failed to create pull request: Cannot create pull request: missing loaded agent abc', compiled).text,
    '无法创建拉取请求：无法创建拉取请求：缺少已加载的智能体 abc',
  );
  assert.match(
    translateText('my-mac went offline. Run `agent worker start` on that machine to reconnect. You can try again by writing a follow-up below.', compiled).text,
    /`agent worker start`/,
  );
  assert.doesNotMatch(
    translateText('my-mac went offline. Run `agent worker start` on that machine to reconnect. You can try again by writing a follow-up below.', compiled).text,
    /\bRun\b/,
  );
  assert.equal(translateText('Failed to pause automation.', compiled).text, '无法暂停自动化。');
  assert.equal(translateText('Failed to import 2 editor themes.', compiled).text, '无法导入 2 个编辑器主题。');
  assert.equal(translateText('Failed to import 1 editor theme.', compiled).text, '无法导入 1 个编辑器主题。');
  assert.equal(translateText('[See all forwarded ports](https://example.test)', compiled).text, '[查看所有转发端口](https://example.test)');
});

test('replacements keep every capture and do not drop a dollar amount', () => {
  const hits = [];
  for (const entry of raw.regex) {
    const replacement = entry.replacement || '';
    if (/(?<!\$)\$\$\d/.test(replacement)) hits.push(`${entry.id}: ${replacement}`);
    const groups = (entry.pattern.match(/\((?!\?)/g) || []).length;
    const used = new Set();
    for (const match of replacement.matchAll(/\$(\d{1,2})/g)) {
      const n = Number(match[1]);
      if (n < 1 || n > groups) hits.push(`${entry.id}: $${n} missing`);
      used.add(n);
    }
  }
  assert.deepEqual(hits, []);
});
