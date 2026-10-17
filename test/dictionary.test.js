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
  assert.equal(translateText('Worked for 6s', compiled).text, '工作了 6 秒');
  assert.equal(translateText('26m ago', compiled).text, '26 分钟前');
  assert.equal(translateText('4h ago', compiled).text, '4 小时前');
  assert.equal(translateText('4h\u202fago', compiled).text, '4 小时前');
  assert.equal(translateText('2m ago', compiled).text, '2 分钟前');
  assert.equal(translateText('2mo ago', compiled).text, '2 个月前');
  assert.equal(translateText('12s ago', compiled).text, '12 秒前');
  assert.equal(translateText('3% used', compiled).text, '已使用 3%');
  assert.equal(translateText('$0.00 remaining', compiled).text, '剩余 $0.00');
  assert.equal(translateText('Included in Ultra', compiled).text, '已包含在 Ultra 中');
  assert.equal(translateText('Installed 3', compiled).text, '已安装 3');
  assert.equal(translateText('Needs Attention 2', compiled).text, '需要关注 2');
  assert.equal(translateText('Connected 1', compiled).text, '已连接 1');
  assert.equal(translateText('31 tools enabled', compiled).text, '31 个工具已启用');
  assert.equal(translateText('1 tool enabled', compiled).text, '1 个工具已启用');
  assert.equal(translateText('2 tools, 1 resource enabled', compiled).text, '2 个工具、1 个资源已启用');
  assert.equal(translateText('Show 4 more', compiled).text, '再显示 4 项');
  assert.equal(raw.exact['Open Browser Tab'], '打开浏览器标签页');
  assert.equal(raw.exact['New Output View'], '新建输出视图');
  assert.equal(raw.exact['This Computer'], '这台计算机');
  assert.equal(raw.exact['Remote Machine'], '远程计算机');
  assert.equal(raw.exact.Steer, '引导');
  assert.equal(raw.exact['Steer the agent without stopping it'], '引导智能体而不停止它');
  assert.equal(
    raw.exact['Use /simplify to have Cursor review all changed files for code quality and efficiency'],
    '使用 /simplify 让 Cursor 审查所有已更改文件的代码质量和效率',
  );
  assert.equal(
    raw.exact['Use /cloud to run agents remotely for better parallelization and durable execution'],
    '使用 /cloud 在远程运行智能体，以便更好地并行并持久执行',
  );
  assert.equal(
    raw.exact['Use /in-cloud to start a subagent in its own cloud VM, keeping your local workspace free'],
    '使用 /in-cloud 在独立的云端虚拟机中启动子智能体，让本地工作区保持空闲',
  );
  assert.equal(
    raw.exact['Use /review for an agentic code review of your changes'],
    '使用 /review 对你的更改进行智能体代码审查',
  );
  assert.equal(
    raw.exact['Use /automate to create Cursor Automations without leaving your agent chat'],
    '使用 /automate 创建 Cursor 自动化，无需离开智能体聊天',
  );
  assert.equal(
    raw.exact['Messages sent while Cursor is working can steer it mid-run without interrupting - turn it on under New Messages in Agent settings'],
    'Cursor 工作时发送的消息可以在运行中引导它而不打断。在智能体设置的「新消息」里打开。',
  );
  assert.equal(raw.exact.Today, '今天');
  assert.equal(raw.exact.Yesterday, '昨天');
  assert.equal(raw.exact.Older, '更早');
  assert.equal(raw.exact['Previous 7 days'], '过去 7 天');
  assert.equal(raw.exact['Manage Environment'], '管理环境');
  assert.equal(raw.exact.New, '新建');
  assert.equal(raw.exact.NEW, '新');
  assert.equal(translateText('% used', compiled).text, '% 已使用');
  assert.equal(translateText('5% used', compiled).text, '已使用 5%');
  assert.equal(translateText('$0.00 remaining', compiled).text, '剩余 $0.00');
  assert.equal(translateText('Weekly usage resets on Oct 24 (7 days left)', compiled).text, '每周用量将于 10 月 24 日重置（还剩 7 天）');
  assert.equal(
    translateText('Included usage with your subscription. Resets Oct 24. Used before your credits.', compiled).text,
    '订阅包含的用量。将于 10 月 24 日重置。会在额度之前消耗。',
  );
  assert.equal(raw.exact['Send follow-up'], '发送后续消息');
  assert.equal(raw.exact['Cursor Agents Window'], 'Cursor 智能体窗口');
  assert.equal(raw.exact.Account, '账户');
  assert.equal(raw.exact['Log Out'], '退出登录');
  assert.equal(raw.exact['Sign out'], '退出登录');
  assert.equal(raw.exact['Set Up Origin'], '设置 Origin');
  assert.equal(
    raw.exact['Create an Origin namespace to save and publish your work easily'],
    '创建一个 Origin 命名空间，方便保存和发布你的工作',
  );
  assert.equal(raw.exact['Get Started'], '开始使用');
  assert.equal(raw.exact.Update, '更新');
  assert.equal(raw.exact.Later, '稍后');
  assert.equal(
    translateText('A newer Cursor package (3.25.9) is available via apt.', compiled).text,
    '有新的 Cursor 安装包（3.25.9）可通过 apt 获取。',
  );
  assert.equal(
    translateText('A newer Cursor package (1.0) is available via download.', compiled).text,
    '有新的 Cursor 安装包（1.0）可通过 download 获取。',
  );
  assert.equal(
    raw.exact['A newer version of Cursor is available. We recommend updating for the best experience.'],
    '有新版本的 Cursor 可用。建议更新以获得最佳体验。',
  );
  assert.equal(compiled.placeholders.length > 10, true);
  assert.equal(translateText('Explored 2 searches', compiled).text, '探索了 2 次搜索');
  assert.equal(translateText('Loading chat', compiled).text, '正在加载聊天');
  assert.equal(translateText('New Automation', compiled).text, '新建自动化');
  assert.equal(translateText('Find critical bugs', compiled).text, '查找严重缺陷');
  assert.equal(translateText('6% used', compiled).text, '已使用 6%');
  assert.equal(translateText('Worked for 6s', compiled).text, '工作了 6 秒');
  assert.equal(translateText('Use Cloud Agents inside a longer sentence', compiled).changed, false);
});

test('generated runtime is plain script and passes node --check', () => {
  const { raw } = loadDictionary();
  const script = buildRuntimeScript(raw);
  assert.doesNotMatch(script, /^export\s/m);
  assert.match(script, /新建智能体/);
  assert.match(script, /MutationObserver/);
  assert.match(script, /requestIdleCallback/);
  assert.match(script, /timeout:\s*50/);
  assert.match(script, /setTimeout\(fn,\s*0\)/);
  assert.match(script, /scheduleSoon/);
  assert.match(script, /scheduleIdle/);
  assert.match(script, /budgetMs:\s*2000/);
  assert.match(script, /__cursorZhHans\.disconnect/);
  assert.match(script, /__cursorZhHans\.report/);
  assert.match(script, /is-editor-mention-only/);
  assert.doesNotMatch(script, /textContent/);
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
