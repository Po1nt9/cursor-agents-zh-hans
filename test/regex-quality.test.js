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

test('field types, themes, resume, and the remaining review strings', () => {
  assert.equal(translateText('Imported 2 themes from the IDE.', compiled).text, '已从 IDE 导入 2 个主题。');
  assert.equal(translateText('Imported 1 theme from the IDE.', compiled).text, '已从 IDE 导入 1 个主题。');
  assert.equal(translateText('Please enter a valid number for Port', compiled).text, '请为 Port 输入有效的数字');
  assert.equal(translateText('Please enter a valid string for Name', compiled).text, '请为 Name 输入有效的字符串');
  assert.equal(translateText('Please enter a valid boolean for Enabled', compiled).text, '请为 Enabled 输入有效的布尔值');
  assert.equal(translateText('Please enter a valid integer for Port', compiled).text, '请输入 Port 的有效整数');
  assert.equal(
    translateText("This run will resume automatically when it's back (waits up to 1 hour).", compiled).text,
    '恢复后，这次运行会自动继续（最多等待 1 小时）。',
  );
  assert.equal(
    translateText("This run will resume automatically when it's back (waits up to 2 hours).", compiled).text,
    '恢复后，这次运行会自动继续（最多等待 2 小时）。',
  );
  assert.equal(
    translateText('The self-hosted worker went offline. Run `agent worker start` on that machine, or open the Cursor desktop app, to reconnect. This run will resume automatically when it\'s back (waits up to 1 hour).', compiled).text,
    '自托管工作节点已离线。请在那台计算机上运行 `agent worker start`，或打开 Cursor 桌面应用以重新连接。恢复后，这次运行会自动继续（最多等待 1 小时）。',
  );
  assert.equal(
    translateText('Please enter a valid email address for Work Email', compiled).text,
    '请输入 Work Email 的有效电子邮件地址',
  );
  assert.equal(translateText('Retrying automatically', compiled).text, '正在自动重试');
  assert.equal(
    translateText('GitHub IP allow list blocks repository access', compiled).text,
    'GitHub IP 允许列表阻止了仓库访问',
  );
  assert.equal(
    translateText('Agent Review: Off under private inference', compiled).text,
    '智能体审查：私密推理模式下已关闭',
  );
  assert.equal(
    translateText('Failed to add plugin to marketplace: Foo', compiled).text,
    '无法把插件添加到插件市场：Foo',
  );
  assert.equal(
    translateText('Cannot use private worker: unable to determine repository from remote URL "git@github.com:acme/app.git". Please ensure this is a valid Git repository URL.', compiled).text,
    '无法使用私有工作节点：无法从远程 URL“git@github.com:acme/app.git”确定仓库。请确认这是有效的 Git 仓库 URL。',
  );
  assert.equal(
    translateText('Cannot use private worker: unable to determine repository from remote URL. Please ensure this is a valid Git repository URL.', compiled).text,
    '无法使用私有工作节点：无法从远程 URL 确定仓库。请确认这是有效的 Git 仓库 URL。',
  );
  assert.equal(
    translateText('Image selected in conversation was not found on disk: /tmp/a.png', compiled).text,
    '对话中选择的图片在磁盘上不存在：/tmp/a.png',
  );
  assert.equal(
    translateText('Cannot enable pull request auto-merge: missing prUrl for agent abc', compiled).text,
    '无法启用拉取请求的自动合并：智能体 abc 缺少 prUrl',
  );
  assert.equal(
    translateText('Cannot disable pull request auto-merge: missing prUrl for agent abc', compiled).text,
    '无法禁用拉取请求的自动合并：智能体 abc 缺少 prUrl',
  );
  assert.equal(translateText('acme/app repository access failed', compiled).text, 'acme/app 的仓库访问失败');
  assert.equal(
    translateText('No-repo team automation environment was created but could not be located in the refetched list.', compiled).text,
    '已创建无仓库的团队自动化环境，但在重新获取的列表中找不到它。',
  );
  assert.equal(
    translateText('Browser tool click is blocked because the current page origin cannot be determined. Allowed origins: https://example.com', compiled).text,
    '浏览器工具 click 已被阻止，因为无法确定当前页面的来源。允许的来源：https://example.com',
  );
  assert.equal(
    translateText('Browser tool click is blocked because the current page URL is invalid. Allowed origins: https://example.com', compiled).text,
    '浏览器工具 click 已被阻止，因为当前页面的 URL 无效。允许的来源：https://example.com',
  );
  assert.equal(
    translateText('Browser tool click is blocked on origin https://evil.test by administrator settings. Allowed origins: https://example.com', compiled).text,
    '管理员设置已阻止浏览器工具 click 访问来源 https://evil.test。允许的来源：https://example.com',
  );
  assert.equal(
    translateText('Could not open cloud agent abc', compiled).text,
    '无法打开云端智能体 abc',
  );
  assert.equal(
    translateText('Adding a local agent to a cloud Project is not enabled (agent abc)', compiled).text,
    '未启用将本地智能体添加到云端项目（智能体 abc）',
  );
  assert.equal(
    translateText('Remote Control is not available for agent abc', compiled).text,
    '智能体 abc 不能使用远程控制',
  );
  assert.equal(
    translateText('Cannot pull cloud branch "feature": no matching remote branch found', compiled).text,
    '无法拉取云端分支“feature”：未找到匹配的远程分支',
  );
  assert.equal(
    translateText('Cannot pull a multi-repo cloud agent into a workspace with different repositories', compiled).text,
    '无法把多仓库云端智能体拉入包含不同仓库的工作区',
  );
  assert.equal(translateText('Undo failed for "x": y', compiled).text, '无法撤消“x”：y');
  assert.equal(
    translateText('Composer archive state could not be persisted: composer-1', compiled).text,
    '无法保存聊天的归档状态：composer-1',
  );
  assert.equal(
    translateText('Invalid format for JSON theme file: Object expected.', compiled).text,
    'JSON 主题文件的格式无效：应为对象。',
  );
  assert.equal(
    translateText("Problem parsing color theme file: dark.json. Property 'semanticTokenColors' contains a invalid selector", compiled).text,
    '解析颜色主题文件时出错：dark.json。属性 semanticTokenColors 包含无效的选择器',
  );
  assert.equal(
    translateText('Failed to get profile from URL: https://example.com/p. Status code: 404. Message: missing', compiled).text,
    '无法从 URL 获取配置文件：https://example.com/p。状态码：404。消息：missing',
  );
  assert.equal(
    translateText('Task "build" uses sequential dependencies that are not supported in Glass task terminals.', compiled).text,
    'Glass 任务终端不支持任务“build”使用的顺序依赖。',
  );
  assert.equal(translateText('The extension host did not start in time.', compiled).text, '扩展宿主启动超时。');
  assert.equal(translateText('The debug server did not start in time.', compiled).text, '调试服务器启动超时。');
  assert.equal(translateText('Usage · Resets Nov 1', compiled).text, '用量 · 11月1日重置');
  assert.equal(
    translateText('Included usage with your subscription. Resets November 1.', compiled).text,
    '订阅内含用量，11月1日重置。',
  );
  assert.equal(
    translateText('Invalid response: HTTP 500 Internal Server Error via nginx during CORS', compiled).text,
    '响应无效：跨域请求期间，经由 nginx 返回 HTTP 500 内部服务器错误',
  );
  assert.equal(
    translateText('Received 3 subscription events while this conversation was busy or offline.', compiled).text,
    '此对话忙碌或离线时，收到了 3 条订阅事件。',
  );
  assert.equal(translateText('Cannot resolve authority', compiled).text, '无法解析远程主机');
  assert.equal(translateText('Failed to stash changes: boom', compiled).text, '无法储藏更改：boom');
  assert.equal(translateText('Focus Editor Sticky Scroll', compiled).text, '聚焦到编辑器粘滞滚动');
  assert.equal(
    translateText('Cannot capture check-in. No client defined.', compiled).text,
    '无法捕获 check-in。未定义客户端。',
  );
  assert.equal(
    translateText('Run Everything is already enabled for this agent', compiled).text,
    '此智能体已经启用“全部运行”。',
  );
  assert.equal(
    translateText('Failed to unpublish canvas (notes). Try again later.', compiled).text,
    '无法取消发布 Canvas（notes）。请稍后重试。',
  );
  assert.equal(
    translateText("Cursor could not authenticate with", compiled).text,
    'Cursor 无法完成身份验证',
  );
  const secret = translateText("Delete this secret?\n\nname\n\nThis action cannot be undone.", compiled).text;
  assert.match(secret, /^是否删除此密钥？\n\nname\n\n此操作无法撤消。$/);
  const notice = 'The extension host did not start in time.\n\nReload the window and try again. If this keeps happening, disable recently added extensions or others that may slow extension host startup.';
  assert.match(translateText(notice, compiled).text, /^扩展宿主启动超时/);
  assert.doesNotMatch(translateText(notice, compiled).text, /Reload the window/);
  const collapsed = notice.replace(/\n+/g, ' ');
  assert.match(translateText(collapsed, compiled).text, /^扩展宿主启动超时/);
  const debug = 'The debug server did not start in time.\n\nPlease check the [NDJSON port setting](command:workbench.action.openWorkspaceSettings?%5B%22ndjson.port%22%5D) and ensure:\n- The port is not already in use by another service\n- You have permission to use the port (try a port above 1024)';
  const debugZh = translateText(debug, compiled).text;
  assert.match(debugZh, /^调试服务器启动超时/);
  assert.match(debugZh, /\[NDJSON 端口设置\]\(command:workbench\.action\.openWorkspaceSettings/);
  assert.doesNotMatch(debugZh, /did not start/);
  assert.equal(
    translateText("Error: the description doesn't define a file location:\nfoo", compiled).text,
    '错误：说明未定义文件位置：foo',
  );
  assert.equal(
    translateText('Invalid response: HTTP 500 Internal Server Error during CORS', compiled).text,
    '响应无效：跨域请求期间返回 HTTP 500 内部服务器错误',
  );
  assert.equal(
    translateText('Invalid response: HTTP 502 Bad Gateway via nginx during CORS', compiled).text,
    '响应无效：跨域请求期间 HTTP 502（Bad Gateway，经由 nginx）',
  );
  assert.equal(
    translateText('Tool blocked because this hook is configured to fail closed (block when it fails). Hook "lint" failed with exit code 2', compiled).text,
    '工具已被阻止，因为此钩子配置为失败即阻止（失败时拦截）。钩子“lint”失败，退出码为 2。',
  );
  assert.equal(
    translateText('Tool blocked because this hook is configured to fail closed (block when it fails). Hook "lint" failed with exit code 2: boom', compiled).text,
    '工具已被阻止，因为此钩子配置为失败即阻止（失败时拦截）。钩子“lint”失败，退出码为 2：boom',
  );
  assert.equal(translateText('Focus Accessible Terminal View', compiled).text, '聚焦到可访问终端视图');
  assert.equal(
    translateText('SDK not enabled, will not capture check-in.', compiled).text,
    'SDK 未启用，不会捕获 check-in。',
  );
  assert.equal(
    translateText('Invalid uri. Scheme and authority or path must be set.', compiled).text,
    'URI 无效。必须设置方案以及主机或路径。',
  );
  assert.equal(
    translateText("Cannot get default system shell when there is no backend for remote authority 'ssh-remote'", compiled).text,
    '无法获取默认系统 Shell，因为远程主机“ssh-remote”没有后端',
  );
  assert.equal(
    translateText('Failed to add plugin to marketplaces: Foo', compiled).text,
    '无法把插件添加到插件市场：Foo',
  );
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
