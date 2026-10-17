import assert from 'node:assert/strict';
import test from 'node:test';
import { startDomTranslator } from '../src/dom.js';
import {
  applyFragments,
  compileDictionary,
  shouldSkipElement,
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
  assert.equal(shouldSkipElement(element({ classes: ['composer-messages-container'] })), true);
  assert.equal(shouldSkipElement(element({ tag: 'TEXTAREA' })), true);
  assert.equal(shouldSkipElement(element({ editable: true })), true);
  assert.equal(shouldSkipElement(element({ attrs: { contenteditable: 'true' } })), true);
  assert.equal(shouldSkipElement(element({ tag: 'CODE' })), true);
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
