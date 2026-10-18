import assert from 'node:assert/strict';
import test from 'node:test';
import { startDomTranslator } from '../src/dom.js';
import {
  applyFragments,
  compileDictionary,
  shouldSkipAttributeTarget,
  shouldSkipElement,
  skipReason,
  translateText,
} from '../src/engine.js';

const dictionary = compileDictionary({
  exact: {
    'New Agent': '新建智能体',
    Cancel: '取消',
    Save: '保存',
    Close: '关闭',
    'Give Agents a Computer': '给智能体一台电脑',
  },
  fragments: [
    { from: 'New Agent', to: '新建智能体' },
  ],
  regex: [
    { id: 'files', pattern: '^(\\d+) files?$', flags: '', replacement: '$1 个文件' },
    { id: 'pr', pattern: '^PR #(\\d+)$', flags: '', replacement: '拉取请求 #$1' },
  ],
});

test('exact match keeps surrounding whitespace', () => {
  const result = translateText('  New Agent\n', dictionary);
  assert.equal(result.tier, 'exact');
  assert.equal(result.text, '  新建智能体\n');
});

test('regex replaces the whole label and leaves other numbers alone', () => {
  assert.deepEqual(translateText('3 files', dictionary), {
    text: '3 个文件',
    changed: true,
    tier: 'regex',
  });
  assert.equal(translateText('3 files changed', dictionary).changed, false);
  assert.equal(translateText('PR #12', dictionary).text, '拉取请求 #12');
});

test('fragments match a whole label and do not leave a mixed sentence', () => {
  assert.equal(applyFragments('New Agents', dictionary.fragments), 'New Agents');
  assert.equal(translateText('Open New Agent today', dictionary).text, 'Open New Agent today');
  assert.equal(translateText('New Agent', dictionary).tier, 'exact');
  const whole = compileDictionary({
    exact: {},
    fragments: [{ from: 'New Agent', to: '新建智能体' }],
    regex: [],
  });
  assert.equal(translateText('New Agent', whole).text, '新建智能体');
  assert.equal(translateText('New Agent', whole).tier, 'fragment');
  assert.equal(translateText('Open New Agent today', whole).text, 'Open New Agent today');
});

test('longer exact labels are not auto-applied inside a larger sentence', () => {
  const compiled = compileDictionary({
    exact: {
      'New Agents Window': '新建智能体窗口',
      'Agents Window': '智能体窗口',
      'Cloud Agent': '云端智能体',
    },
    fragments: [{ from: 'Cloud Agent', to: '云端智能体' }],
    regex: [],
  });
  assert.equal(translateText('New Agents Window', compiled).tier, 'exact');
  assert.equal(translateText('Use New Agents Window now', compiled).text, 'Use New Agents Window now');
  assert.equal(
    translateText('Cloud Agent Approval Banners While Focused', compiled).text,
    'Cloud Agent Approval Banners While Focused',
  );
});

test('rejects unanchored and global regular expressions', () => {
  assert.throws(() => compileDictionary({
    exact: {},
    fragments: [],
    regex: [{ pattern: 'files?', replacement: '文件' }],
  }));
  assert.throws(() => compileDictionary({
    exact: {},
    fragments: [],
    regex: [{ pattern: '^files?$', flags: 'g', replacement: '文件' }],
  }));
});

test('rejects short fragments', () => {
  assert.throws(() => compileDictionary({
    exact: {},
    fragments: [{ from: 'Agent', to: '智能体' }],
    regex: [],
  }));
});

function element({ tag = 'DIV', classes = [], parent = null, attrs = {}, editable = false } = {}) {
  return {
    nodeType: 1,
    tagName: tag,
    classList: { contains: (name) => classes.includes(name) },
    parentElement: parent,
    isContentEditable: editable,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    getRootNode() {
      return { host: null };
    },
  };
}

test('skips editor, terminal, diff, chat, and inputs, and translates other labels', () => {
  const button = element();
  assert.equal(shouldSkipElement(button), false);

  const editor = element({ classes: ['monaco-editor'] });
  const line = element({ parent: editor });
  assert.equal(shouldSkipElement(line), true);

  const term = element({ classes: ['xterm'] });
  assert.equal(shouldSkipElement(element({ parent: term })), true);
  assert.equal(shouldSkipElement(element({ classes: ['terminal-wrapper'] })), true);
  assert.equal(shouldSkipElement(element({ classes: ['diff-line-content'] })), true);
  assert.equal(shouldSkipElement(element({ classes: ['markdown-root'] })), true);
  const tooltip = element({ attrs: { role: 'tooltip' } });
  const tooltipMarkdown = element({ classes: ['markdown-root'], parent: tooltip });
  assert.equal(shouldSkipElement(tooltipMarkdown), false);
  const popup = element({ attrs: { 'data-component': 'tooltip-popup' } });
  const popupMarkdown = element({ classes: ['markdown-root'], parent: popup });
  assert.equal(shouldSkipElement(popupMarkdown), false);
  assert.equal(skipReason(popupMarkdown), null);
  const pickerName = element({ classes: ['ui-model-picker__item-content-name'] });
  const pickerMarkdown = element({ classes: ['markdown-root'], parent: pickerName });
  assert.equal(shouldSkipElement(pickerMarkdown), false);
  assert.equal(shouldSkipElement({ nodeType: 3, parentElement: pickerMarkdown }), false);
  const menu = element({ classes: ['ui-model-picker__menu'] });
  const autoMarkdown = element({ classes: ['markdown-root'], parent: menu });
  assert.equal(shouldSkipElement(autoMarkdown), false);
  assert.equal(skipReason(autoMarkdown), null);
  assert.equal(skipReason(element({ classes: ['markdown-root'] })), 'class:markdown-root');
  assert.equal(skipReason(element({ attrs: { 'data-message-kind': 'assistant' } })), 'message-kind:assistant');
  assert.equal(
    shouldSkipElement(element({ classes: ['markdown-root', 'vscode-model-picker__trigger-markdown'] })),
    false,
  );
  assert.equal(shouldSkipElement(element({ classes: ['composer-messages-container'] })), false);
  assert.equal(shouldSkipElement(element({ tag: 'TEXTAREA' })), true);
  assert.equal(shouldSkipElement(element({ editable: true })), true);
  assert.equal(shouldSkipElement(element({ attrs: { contenteditable: 'true' } })), true);
  assert.equal(shouldSkipElement(element({ tag: 'CODE' })), true);
  assert.equal(shouldSkipElement(element({ tag: 'OPTION' })), false);
  assert.equal(shouldSkipElement(element({ attrs: { 'data-message-kind': 'assistant' } })), true);
  assert.equal(shouldSkipElement(element({ attrs: { 'data-message-kind': 'tool' } })), false);
  assert.equal(shouldSkipAttributeTarget(element({ tag: 'INPUT' })), false);
  assert.equal(shouldSkipAttributeTarget(element({ tag: 'TEXTAREA' })), false);
  assert.equal(shouldSkipAttributeTarget(element({ editable: true })), true);
  assert.equal(shouldSkipAttributeTarget(element({ attrs: { contenteditable: 'true' } })), true);
  assert.equal(shouldSkipAttributeTarget(element({ classes: ['ProseMirror'] })), true);
  assert.equal(shouldSkipAttributeTarget(element({ classes: ['tiptap'] })), true);
  const prose = element({ classes: ['ProseMirror'], editable: true });
  assert.equal(shouldSkipAttributeTarget(element({ parent: prose })), true);
  assert.equal(shouldSkipAttributeTarget(element({ classes: ['markdown-root'] })), true);
  assert.equal(shouldSkipAttributeTarget(element({ classes: ['ui-kbd'] })), true);
});

test('skips text inside a shadow tree hosted by a protected element', () => {
  const host = element({ classes: ['composer-human-message'] });
  const inner = element();
  inner.getRootNode = () => ({ host });
  const text = { nodeType: 3, parentElement: inner };
  assert.equal(shouldSkipElement(text), true);
});

test('mutation observer translates added nodes and attributes, not a later full scan', () => {
  const nodes = [];
  function makeElement(tag = 'DIV') {
    const el = {
      nodeType: 1,
      tagName: tag,
      classList: { contains: () => false },
      parentElement: null,
      childNodes: [],
      attrs: {},
      isContentEditable: false,
      shadowRoot: null,
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
      appendChild(child) {
        child.parentElement = this;
        this.childNodes.push(child);
        return child;
      },
      getRootNode() { return { host: null }; },
    };
    nodes.push(el);
    return el;
  }
  function makeText(value) {
    return { nodeType: 3, nodeValue: value, parentElement: null };
  }

  class MockObserver {
    constructor(callback) {
      this.callback = callback;
      MockObserver.latest = this;
    }
    observe() {}
    disconnect() {}
    emit(records) { this.callback(records); }
  }

  const body = makeElement('BODY');
  const root = makeElement('HTML');
  root.appendChild(body);
  const cancel = makeText('Cancel');
  body.appendChild(cancel);
  const keep = makeText('Keep');
  body.appendChild(keep);
  const input = makeElement('INPUT');
  const typed = makeText('New Agent');
  input.appendChild(typed);
  body.appendChild(input);
  const editor = makeElement('DIV');
  editor.classList = { contains: (name) => name === 'monaco-editor' };
  const code = makeText('New Agent');
  editor.appendChild(code);
  body.appendChild(editor);
  const field = makeElement('DIV');
  field.attrs.placeholder = 'New Agent';
  body.appendChild(field);

  const handle = startDomTranslator({
    translateText,
    shouldSkipElement,
    dictionary,
    version: 'test',
  }, {
    document: { body, documentElement: root },
    MutationObserver: MockObserver,
    Element: class {},
    window: {},
  });

  assert.equal(cancel.nodeValue, '取消');
  assert.equal(typed.nodeValue, 'New Agent');
  assert.equal(code.nodeValue, 'New Agent');
  assert.equal(field.attrs.placeholder, '新建智能体');

  keep.nodeValue = 'Close';
  const saveHost = makeElement('DIV');
  const save = makeText('Save');
  saveHost.appendChild(save);
  MockObserver.latest.emit([{ type: 'childList', addedNodes: [saveHost] }]);
  assert.equal(keep.nodeValue, 'Close');
  assert.equal(save.nodeValue, '保存');

  MockObserver.latest.emit([{ type: 'characterData', target: keep }]);
  assert.equal(keep.nodeValue, '关闭');

  const before = cancel.nodeValue;
  MockObserver.latest.emit([{ type: 'characterData', target: cancel }]);
  assert.equal(cancel.nodeValue, before);

  handle.disconnect();
});

test('split sentence is translated as a whole and a lone short label still changes', () => {
  function makeElement(tag = 'DIV') {
    const el = {
      nodeType: 1,
      tagName: tag,
      classList: { contains: () => false },
      parentElement: null,
      childNodes: [],
      attrs: {},
      isContentEditable: false,
      shadowRoot: null,
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
      appendChild(child) {
        child.parentElement = this;
        this.childNodes.push(child);
        return child;
      },
      getRootNode() { return { host: null }; },
    };
    return el;
  }
  function makeText(value) {
    return { nodeType: 3, nodeValue: value, parentElement: null };
  }
  class MockObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  }

  const compiled = compileDictionary({
    exact: {
      Voice: '语音',
      'Voice mode lets you dictate better prompts for your agents': '语音模式可以让你口述出更好的智能体提示',
      'Plan New Idea': '计划新想法',
      'Cloud Agent Approval Banners While Focused': '聚焦时显示云端智能体批准横幅',
    },
    fragments: [{ from: 'Cloud Agent', to: '云端智能体' }],
    regex: [],
  });

  const body = makeElement('BODY');
  const root = makeElement('HTML');
  root.appendChild(body);
  const sentence = makeElement('P');
  const voice = makeText('Voice');
  const rest = makeText(' mode lets you dictate better prompts for your agents');
  sentence.appendChild(voice);
  sentence.appendChild(rest);
  body.appendChild(sentence);
  const idea = makeElement('BUTTON');
  const ideaText = makeText('Plan New Idea');
  const shortcut = makeText('Tab');
  idea.appendChild(ideaText);
  idea.appendChild(shortcut);
  body.appendChild(idea);
  const title = makeElement('DIV');
  const titleText = makeText('Cloud Agent Approval Banners While Focused');
  title.appendChild(titleText);
  body.appendChild(title);
  const nav = makeElement('BUTTON');
  const navText = makeText('Voice');
  nav.appendChild(navText);
  body.appendChild(nav);

  startDomTranslator({
    translateText,
    shouldSkipElement,
    dictionary: compiled,
    version: 'test',
  }, {
    document: { body, documentElement: root },
    MutationObserver: MockObserver,
    Element: class {},
    window: {},
  });

  assert.equal(voice.nodeValue, '语音模式可以让你口述出更好的智能体提示');
  assert.equal(rest.nodeValue, '');
  assert.equal(ideaText.nodeValue, '计划新想法');
  assert.equal(shortcut.nodeValue, 'Tab');
  assert.equal(titleText.nodeValue, '聚焦时显示云端智能体批准横幅');
  assert.equal(navText.nodeValue, '语音');
});

test('placeholders inside editors translate, and chat chrome does too, while message bodies stay', () => {
  function makeElement(tag = 'DIV', options = {}) {
    const classes = options.classes || [];
    const el = {
      nodeType: 1,
      tagName: tag,
      classList: { contains: (name) => classes.includes(name) },
      parentElement: null,
      childNodes: [],
      attrs: { ...(options.attrs || {}) },
      isContentEditable: Boolean(options.editable),
      shadowRoot: null,
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
      appendChild(child) {
        child.parentElement = this;
        this.childNodes.push(child);
        return child;
      },
      getRootNode() { return { host: null }; },
    };
    return el;
  }
  function makeText(value) {
    return { nodeType: 3, nodeValue: value, parentElement: null };
  }
  class MockObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  }

  const plan = 'Plan, Build, / for skills, @ for context';
  const planZh = '计划、构建，/ 调用技能，@ 添加上下文';
  const compiled = compileDictionary({
    exact: {
      [plan]: planZh,
      'Send follow-up': '发送后续消息',
      'Search Settings': '搜索设置',
      Tab: '补全',
      English: '英语',
      'Keep this reply': '保留这段回复',
    },
    fragments: [],
    regex: [
      { id: 'worked', pattern: '^Worked for (\\d+)s$', flags: '', replacement: '工作了 $1 秒' },
      { id: 'ago', pattern: '^(\\d+)h ago$', flags: '', replacement: '$1 小时前' },
    ],
    placeholders: [plan, 'Send follow-up'],
  });

  const body = makeElement('BODY');
  const root = makeElement('HTML');
  const head = makeElement('HEAD');
  root.appendChild(head);
  root.appendChild(body);

  const box = makeElement('DIV', { classes: ['ai-input-full-input-box'] });
  const editor = makeElement('DIV', { attrs: { contenteditable: 'true' }, editable: true });
  const empty = makeElement('P', {
    attrs: { 'data-placeholder': 'Plan, Build, / for skills, @ for context' },
  });
  const typed = makeText('Keep this reply');
  empty.appendChild(typed);
  editor.appendChild(empty);
  box.appendChild(editor);
  body.appendChild(box);

  const follow = makeElement('DIV', { editable: true, attrs: { contenteditable: 'true' } });
  const followLine = makeElement('P', { attrs: { 'data-placeholder': 'Send follow-up' } });
  follow.appendChild(followLine);
  body.appendChild(follow);

  const search = makeElement('INPUT', { attrs: { placeholder: 'Search Settings' } });
  const searchTyped = makeText('Keep this reply');
  search.appendChild(searchTyped);
  body.appendChild(search);

  const thread = makeElement('DIV', { classes: ['composer-messages-container'] });
  const worked = makeText('Worked for 6s');
  const ago = makeText('4h\u202fago');
  thread.appendChild(worked);
  thread.appendChild(ago);
  const assistant = makeElement('DIV', { attrs: { 'data-message-kind': 'assistant' } });
  const reply = makeText('Keep this reply');
  assistant.appendChild(reply);
  thread.appendChild(assistant);
  const markdown = makeElement('DIV', { classes: ['markdown-root'] });
  const md = makeText('Keep this reply');
  markdown.appendChild(md);
  thread.appendChild(markdown);
  body.appendChild(thread);

  const kbd = makeElement('SPAN', { classes: ['ui-kbd'] });
  const key = makeText('Tab');
  kbd.appendChild(key);
  body.appendChild(kbd);
  const heading = makeElement('H2');
  const headingText = makeText('Tab');
  heading.appendChild(headingText);
  body.appendChild(heading);

  const option = makeElement('OPTION');
  const language = makeText('English');
  option.appendChild(language);
  body.appendChild(option);

  const host = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary: compiled,
    version: 'test',
  }, {
    document: {
      body,
      head,
      documentElement: root,
      createElement: (tag) => makeElement(tag),
      createTextNode: (value) => makeText(value),
    },
    MutationObserver: MockObserver,
    Element: class {},
    window: host,
  });

  assert.equal(empty.attrs['data-placeholder'], plan);
  assert.equal(typed.nodeValue, 'Keep this reply');
  assert.equal(followLine.attrs['data-placeholder'], 'Send follow-up');
  const css = head.childNodes.map((node) => (node.childNodes || []).map((child) => child.nodeValue || '').join('')).join('\n');
  assert.match(css, /计划、构建，\/ 调用技能，@ 添加上下文/);
  assert.match(css, /is-editor-mention-only/);
  assert.match(css, /::before/);
  assert.equal(typeof host.__cursorZhHans.disconnect, 'function');
  assert.equal(search.attrs.placeholder, '搜索设置');
  assert.equal(searchTyped.nodeValue, 'Keep this reply');
  assert.equal(worked.nodeValue, '工作了 6 秒');
  assert.equal(ago.nodeValue, '4 小时前');
  assert.equal(reply.nodeValue, 'Keep this reply');
  assert.equal(md.nodeValue, 'Keep this reply');
  assert.equal(key.nodeValue, 'Tab');
  assert.equal(headingText.nodeValue, '补全');
  assert.equal(language.nodeValue, '英语');
});
