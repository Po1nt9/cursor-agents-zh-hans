import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDictionary } from '../src/dictionary.js';
import { translateText } from '../src/engine.js';
import { alignNls, normalizeOfficialChinese, selectNlsExact } from '../src/nls-match.js';
import { lintChinese, lintDictionary } from '../src/style.js';

test('shipped translations follow the style guide', () => {
  const { raw } = loadDictionary();
  const problems = lintDictionary(raw);
  assert.deepEqual(problems, []);
});

test('a localized reset date does not leave the credits sentence in English', () => {
  const { compiled } = loadDictionary();
  const mixed = 'Included usage with your subscription. Resets 10月24日. Used before your credits.';
  const text = translateText(mixed, compiled).text;
  assert.equal(text, '订阅内含用量，10月24日重置，会先于额度使用。');
  assert.equal(text.includes('Used'), false);
  assert.equal(lintChinese(mixed, text).includes('mixed-english'), false);
});

test('official nls rows match on the English source', () => {
  const rows = alignNls(
    [['vs/platform/shell/node/shellEnv', ['resolveShellEnvTimeout']]],
    ['Unable to resolve your shell environment in a reasonable time. Please review your shell configuration and restart.'],
    {
      'vs/platform/shell/node/shellEnv': {
        resolveShellEnvTimeout: '无法在合理的时间内解析 shell 环境。请检查 shell 配置，然后重启。',
      },
    },
  );
  const exact = selectNlsExact(rows);
  assert.equal(
    exact.get(rows[0].en),
    '无法在合理的时间内解析 shell 环境。请检查 shell 配置，然后重启。',
  );
  assert.equal(normalizeOfficialChinese('请保存您的文件: 完成'), '请保存你的文件：完成');
});
