import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDictionary, loadStaticRules } from '../src/dictionary.js';
import { translateText } from '../src/engine.js';
import { isAmbiguousStaticRule } from '../src/static-replace.js';
import { buildRuntimeScript } from '../src/runtime.js';
import { assertJavaScriptSyntax } from '../src/syntax.js';
import { diffAgainstDictionary, extractUiStrings } from '../src/scan.js';

test('the shipped dictionary compiles and static rules agree with it', () => {
  const { raw, compiled } = loadDictionary();
  assert.ok(compiled.exact.size > 400);
  assert.ok(compiled.fragments.length >= 10);
  assert.equal(raw.exact['Show rotating tips on the empty screen'], '在空白屏幕上显示轮换提示');
  assert.equal(raw.exact['Cloud Agent Approval Banners While Focused'], '聚焦时显示云端智能体批准横幅');
  assert.equal(
    raw.exact['Voice mode lets you dictate better prompts for your agents'],
    '语音模式可以让你口述出更好的智能体提示',
  );
  assert.ok(compiled.regex.length > 5);
  const rules = loadStaticRules();
  const ids = new Set();
  for (const rule of rules.rules) {
    assert.equal(ids.has(rule.id), false, rule.id);
    ids.add(rule.id);
    assert.equal(isAmbiguousStaticRule(rule), false, rule.id);
    assert.equal(compiled.exact.get(rule.literal), rule.translation, rule.literal);
    assert.equal(typeof rule.expectedHits['3.25.6'], 'number');
  }
  assert.equal(raw.exact['New Agent'], '新建智能体');
  assert.equal(raw.exact.Agent, '智能体');
  assert.equal(raw.exact.Terminal, '终端');
  assert.equal(translateText('Worked for 2m 15s', compiled).text, '工作了 2 分 15 秒');
  assert.equal(translateText('26m ago', compiled).text, '26 分钟前');
  assert.equal(translateText('Explored 2 searches', compiled).text, '探索了 2 次搜索');
  assert.equal(translateText('Use Cloud Agents inside a longer sentence', compiled).changed, false);
});

test('generated runtime is plain script and passes node --check', () => {
  const { raw } = loadDictionary();
  const script = buildRuntimeScript(raw);
  assert.doesNotMatch(script, /\bexport\s/);
  assert.match(script, /新建智能体/);
  assert.match(script, /MutationObserver/);
  assertJavaScriptSyntax(script, 'cursor-zh-hans.js');
});

test('scan diffs candidate strings against the dictionary', () => {
  const source = 'const a = "New Agent"; const b = "New Agent"; const c = "Some Brand New Label"; const d = "camelCase"; const e = "","Memories";';
  const counts = extractUiStrings(source);
  assert.equal(counts.get('New Agent'), 2);
  assert.equal(counts.get('Memories'), 1);
  assert.equal(counts.has('camelCase'), false);
  assert.equal(extractUiStrings('var x = "ERROR"; var y = "Cancel";').has('ERROR'), false);
  const { compiled } = loadDictionary();
  const diff = diffAgainstDictionary(counts, compiled);
  assert.equal(diff.missing.some((item) => item.text === 'Some Brand New Label'), true);
  assert.equal(diff.missing.some((item) => item.text === 'New Agent'), false);
});
