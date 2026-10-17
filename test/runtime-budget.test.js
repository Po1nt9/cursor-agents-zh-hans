import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDictionary } from '../src/dictionary.js';
import { startDomTranslator } from '../src/dom.js';
import {
  compileDictionary,
  shouldSkipAttributeTarget,
  shouldSkipElement,
  skipReason,
  translateText,
} from '../src/engine.js';

function harness(options = {}) {
  const reads = { n: 0 };
  const observerRef = { current: null };
  function makeElement(tag = 'DIV', extra = {}) {
    const classes = extra.classes || [];
    const el = {
      nodeType: 1,
      tagName: tag,
      classList: {
        contains: (name) => classes.includes(name),
        *[Symbol.iterator]() {
          for (const name of classes) yield name;
        },
      },
      parentElement: null,
      childNodes: [],
      attrs: { ...(extra.attrs || {}) },
      isContentEditable: Boolean(extra.editable),
      shadowRoot: extra.shadowRoot || null,
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
      },
      setAttribute(name, value) {
        this.attrs[name] = String(value);
        if (options.onAttribute) options.onAttribute(this, name, this.attrs[name]);
      },
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name);
      },
      appendChild(child) {
        child.parentElement = this;
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
      },
      removeChild(child) {
        this.childNodes = this.childNodes.filter((node) => node !== child);
        if (child.parentNode === this) child.parentNode = null;
        if (child.parentElement === this) child.parentElement = null;
        return child;
      },
      getRootNode() {
        return { host: null };
      },
    };
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get() {
        reads.n += 1;
        return '';
      },
    });
    return el;
  }
  function makeText(value) {
    const node = { nodeType: 3, parentElement: null, _v: value, sets: 0 };
    Object.defineProperty(node, 'nodeValue', {
      get() {
        return node._v;
      },
      set(next) {
        if (node._v === next) return;
        node._v = next;
        node.sets += 1;
        if (node.sets > (options.writeCap || 100000)) {
          throw new Error(`runaway write after ${node.sets} assignments`);
        }
        if (options.onWrite) options.onWrite(node, next);
      },
    });
    return node;
  }
  class MockObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      this.disconnected = false;
      this.emits = 0;
      observerRef.current = this;
    }
    observe() {
      this.connected = true;
    }
    disconnect() {
      this.connected = false;
      this.disconnected = true;
    }
    emit(records) {
      this.emits += 1;
      if (this.emits > (options.emitCap || 100000)) {
        throw new Error(`observer did not settle after ${this.emits} callbacks`);
      }
      if (this.callback) this.callback(records);
    }
  }
  return { makeElement, makeText, MockObserver, reads, observerRef };
}

function mount(bodyChildren, h) {
  const root = h.makeElement('HTML');
  const body = h.makeElement('BODY');
  root.appendChild(body);
  for (const child of bodyChildren) body.appendChild(child);
  return { root, body };
}

test('a wide tree settles without reading full rendered text or chasing its own writes', () => {
  const { compiled } = loadDictionary();
  const h = harness({
    writeCap: 20000,
    emitCap: 20000,
    onWrite(node) {
      const obs = h.observerRef.current;
      if (obs && obs.connected) obs.emit([{ type: 'characterData', target: node }]);
    },
  });
  const texts = [];
  for (let i = 0; i < 4000; i += 1) texts.push(h.makeText('Cancel'));
  const { root, body } = mount(texts, h);
  let calls = 0;
  const started = performance.now();
  startDomTranslator({
    translateText(text, dictionary) {
      calls += 1;
      if (calls > 20000) throw new Error('translateText ran away');
      return translateText(text, dictionary);
    },
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary: compiled,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    budgetMs: 10000,
  });
  const elapsed = performance.now() - started;
  assert.equal(h.reads.n, 0);
  assert.equal(calls, 4000);
  assert.ok(elapsed < 300, `wide walk took ${elapsed.toFixed(1)}ms`);
  for (const node of texts) {
    assert.equal(node.nodeValue, '取消');
    assert.equal(node.sets, 1);
  }
});

test('an external reset back to English settles inside the per-node write budget', () => {
  const dictionary = {
    exact: new Map([['Cancel', '取消']]),
    fragments: [],
    regex: [],
  };
  const h = harness({
    writeCap: 30,
    emitCap: 30,
    onWrite(node, value) {
      if (value !== '取消') return;
      node._v = 'Cancel';
      const obs = h.observerRef.current;
      if (obs && obs.connected) obs.emit([{ type: 'characterData', target: node }]);
    },
  });
  const label = h.makeText('Cancel');
  const { root, body } = mount([label], h);
  const host = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: host,
    budgetMs: 2000,
  });
  assert.ok(label.sets <= 4, `writes=${label.sets}`);
  assert.ok(h.observerRef.current.emits <= 8, `emits=${h.observerRef.current.emits}`);
  assert.equal(host.__cursorZhHansKilled, undefined);
  assert.equal(h.reads.n, 0);
});

test('write cooldown lets a later timestamp through and blocks the burst in between', () => {
  const dictionary = {
    exact: new Map([
      ['Cancel', '取消'],
      ['Close', '关闭'],
      ['Save', '保存'],
    ]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const label = h.makeText('Cancel');
  const { root, body } = mount([label], h);
  let clock = 1000;
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => clock,
    budgetMs: 2000,
  });
  assert.equal(label.nodeValue, '取消');
  label.nodeValue = 'Close';
  h.observerRef.current.emit([{ type: 'characterData', target: label }]);
  assert.equal(label.nodeValue, '关闭');
  label.nodeValue = 'Save';
  h.observerRef.current.emit([{ type: 'characterData', target: label }]);
  assert.equal(label.nodeValue, 'Save');
  clock = 2000;
  h.observerRef.current.emit([{ type: 'characterData', target: label }]);
  assert.equal(label.nodeValue, '保存');
});

test('scheduled startup walks yield and then finish', () => {
  const dictionary = {
    exact: new Map([['Cancel', '取消']]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const texts = [];
  for (let i = 0; i < 800; i += 1) texts.push(h.makeText('Cancel'));
  const { root, body } = mount(texts, h);
  const tasks = [];
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 5000,
    schedule(fn) {
      tasks.push(fn);
    },
  });
  assert.ok(tasks.length >= 1);
  assert.equal(texts.some((node) => node.nodeValue === 'Cancel'), true);
  let guard = 0;
  while (tasks.length) {
    const batch = tasks.splice(0, tasks.length);
    for (const fn of batch) fn();
    guard += 1;
    if (guard > 20) throw new Error('scheduled walk did not settle');
  }
  for (const node of texts) assert.equal(node.nodeValue, '取消');
  assert.equal(h.reads.n, 0);
});

test('a synchronous scheduler drains in bounded stack space', () => {
  const dictionary = {
    exact: new Map([['Cancel', '取消']]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const texts = [];
  for (let i = 0; i < 600; i += 1) texts.push(h.makeText('Cancel'));
  const { root, body } = mount(texts, h);
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 5000,
    schedule(fn) {
      fn();
    },
  });
  for (const node of texts) assert.equal(node.nodeValue, '取消');
});

test('a spent translator disconnects and stops taking more work', () => {
  const dictionary = {
    exact: new Map([['Cancel', '取消'], ['Save', '保存']]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const texts = [];
  for (let i = 0; i < 30; i += 1) texts.push(h.makeText('Cancel'));
  const { root, body } = mount(texts, h);
  let tick = 0;
  const host = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: host,
    now() {
      tick += 1000;
      return tick;
    },
    budgetMs: 0,
  });
  assert.equal(host.__cursorZhHansKilled, true);
  assert.equal(h.observerRef.current.disconnected, true);
  for (const node of texts) assert.equal(node.nodeValue, 'Cancel');
  texts[0].nodeValue = 'Save';
  h.observerRef.current.emit([{ type: 'characterData', target: texts[0] }]);
  assert.equal(texts[0].nodeValue, 'Save');
});

function probe(pattern) {
  let i = pattern.startsWith('^') ? 1 : 0;
  const end = pattern.endsWith('$') ? pattern.length - 1 : pattern.length;
  function parseAtom() {
    if (i >= end) return '';
    let piece = '';
    const ch = pattern[i];
    if (ch === '\\') {
      const next = pattern[i + 1];
      i += 2;
      if (next === 'd') piece = '1';
      else if (next === 's') piece = ' ';
      else piece = next || '';
    } else if (ch === '(') {
      i += 1;
      if (pattern.startsWith('?:', i)) i += 2;
      piece = parseSeq(')');
      if (pattern[i] === ')') i += 1;
    } else if (ch === '.') {
      i += 1;
      piece = 'X';
    } else if (ch === ')' || ch === '|') {
      return '';
    } else {
      piece = ch;
      i += 1;
    }
    if (pattern[i] === '+' || pattern[i] === '?') i += 1;
    else if (pattern[i] === '*') {
      i += 1;
      piece = '';
    } else if (pattern[i] === '{') {
      const match = /^\{(\d+)(?:,(\d+))?\}/.exec(pattern.slice(i));
      if (match) {
        const count = Number(match[1]);
        piece = count === 0 ? '' : piece.repeat(count);
        i += match[0].length;
      }
    }
    return piece;
  }
  function parseSeq(stop) {
    let out = '';
    while (i < end && pattern[i] !== stop && pattern[i] !== '|') out += parseAtom();
    return out;
  }
  return parseSeq('');
}

test('a ProseMirror placeholder that rebuilds on every attribute write settles', () => {
  const english = 'Plan, Build, / for skills, @ for context';
  const chinese = '计划、构建，/ 调用技能，@ 添加上下文';
  const dictionary = compileDictionary({
    exact: { [english]: chinese },
    fragments: [],
    regex: [],
    placeholders: [english],
  });
  let writes = 0;
  const h = harness({ emitCap: 50 });
  const editor = h.makeElement('DIV', {
    classes: ['tiptap', 'ProseMirror'],
    editable: true,
    attrs: { contenteditable: 'true' },
  });
  function makeParagraph() {
    const paragraph = h.makeElement('P', {
      classes: ['is-empty', 'is-editor-empty'],
      attrs: { 'data-placeholder': english },
    });
    paragraph.setAttribute = (name, value) => {
      writes += 1;
      if (writes > 20) throw new Error(`placeholder loop kept writing (${writes})`);
      paragraph.attrs[name] = String(value);
      const fresh = makeParagraph();
      const parent = paragraph.parentElement;
      if (parent) {
        parent.childNodes = parent.childNodes.filter((node) => node !== paragraph);
        parent.appendChild(fresh);
      }
      const obs = h.observerRef.current;
      if (obs && obs.connected) obs.emit([{ type: 'childList', addedNodes: [fresh] }]);
    };
    return paragraph;
  }
  const paragraph = makeParagraph();
  editor.appendChild(paragraph);
  const { root, body } = mount([editor], h);
  const head = h.makeElement('HEAD');
  const host = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'loop',
  }, {
    document: {
      body,
      head,
      documentElement: root,
      createElement: (tag) => h.makeElement(tag),
      createTextNode: (value) => h.makeText(value),
    },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: host,
    budgetMs: 2000,
  });
  assert.equal(writes, 0);
  assert.equal(paragraph.attrs['data-placeholder'], english);
  assert.equal(h.reads.n, 0);
  const css = head.childNodes
    .map((node) => (node.childNodes || []).map((child) => child.nodeValue || '').join(''))
    .join('\n');
  assert.match(css, /计划、构建，\/ 调用技能，@ 添加上下文/);
  assert.match(css, /is-editor-empty/);
  assert.match(css, /is-editor-mention-only/);
  assert.equal(typeof host.__cursorZhHans.disconnect, 'function');
  host.__cursorZhHans.disconnect();
  assert.equal(h.observerRef.current.disconnected, true);
  assert.equal(head.childNodes.length, 0);
});

test('rebuilding the same data-placeholder outside an editor stops after the content window', () => {
  const english = 'Plan changes';
  const dictionary = compileDictionary({
    exact: { [english]: '计划改动' },
    fragments: [],
    regex: [],
  });
  let writes = 0;
  const h = harness({ emitCap: 500 });
  const holder = h.makeElement('DIV');
  function makeTarget() {
    const el = h.makeElement('DIV', { attrs: { 'data-placeholder': english } });
    el.setAttribute = (name, value) => {
      writes += 1;
      if (writes > 40) throw new Error(`attribute loop did not settle (${writes})`);
      el.attrs[name] = String(value);
      const fresh = makeTarget();
      const parent = el.parentElement;
      if (parent) {
        parent.childNodes = parent.childNodes.filter((node) => node !== el);
        parent.appendChild(fresh);
      }
      const obs = h.observerRef.current;
      if (obs && obs.connected) obs.emit([{ type: 'childList', addedNodes: [fresh] }]);
    };
    return el;
  }
  holder.appendChild(makeTarget());
  const { root, body } = mount([holder], h);
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'loop',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    budgetMs: 2000,
  });
  assert.ok(writes > 0 && writes <= 8, `writes=${writes}`);
  const settled = writes;
  const latest = holder.childNodes[holder.childNodes.length - 1];
  h.observerRef.current.emit([{ type: 'childList', addedNodes: [latest] }]);
  assert.equal(writes, settled);
});

test('translation time stays charged after the queue drains', () => {
  const dictionary = {
    exact: new Map([['Cancel', '取消'], ['Save', '保存']]),
    fragments: [],
    regex: [],
    placeholders: [],
  };
  const h = harness();
  const first = h.makeText('Cancel');
  const { root, body } = mount([first], h);
  let clock = 0;
  const host = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: host,
    now() {
      clock += 300;
      return clock;
    },
    budgetMs: 2000,
  });
  assert.equal(first.nodeValue, '取消', `first pass clock=${clock} killed=${host.__cursorZhHansKilled}`);
  const secondHost = h.makeElement('DIV');
  const second = h.makeText('Save');
  secondHost.appendChild(second);
  body.appendChild(secondHost);
  h.observerRef.current.emit([{ type: 'childList', addedNodes: [secondHost] }]);
  assert.equal(host.__cursorZhHansKilled, true, `clock=${clock}`);
  assert.equal(second.nodeValue, 'Save');
});

test('regex buckets keep the same translation as a full scan', () => {
  const { compiled } = loadDictionary();
  const bare = {
    exact: compiled.exact,
    fragments: compiled.fragments,
    regex: compiled.regex,
  };
  const samples = [
    '2m ago',
    '2mo ago',
    'Worked for 6s',
    '4h ago',
    '3% used',
    '$0.00 remaining',
    'Included in Ultra',
    'Weekly usage resets on Oct 24 (7 days left)',
    'Included usage with your subscription. Resets Oct 24. Used before your credits.',
    'Explored 2 searches',
    'PR #12',
  ];
  for (const sample of samples) {
    assert.equal(translateText(sample, compiled).text, translateText(sample, bare).text, sample);
  }
  let hits = 0;
  for (const entry of compiled.regex) {
    const sample = probe(entry.pattern);
    entry.re.lastIndex = 0;
    if (!sample || !entry.re.test(sample)) continue;
    hits += 1;
    assert.equal(
      translateText(sample, compiled).text,
      translateText(sample, bare).text,
      entry.id,
    );
  }
  assert.ok(hits > compiled.regex.length * 0.85, `probes matched ${hits} of ${compiled.regex.length}`);
});

test('a usage row of sibling labels is not swallowed by one regex', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  function labeled(text) {
    const span = h.makeElement('SPAN');
    const node = h.makeText(text);
    span.appendChild(node);
    return node;
  }
  const row = h.makeElement('DIV');
  const included = labeled('Included in Ultra');
  const weekly = labeled('Weekly usage limit');
  const used = labeled('5% used');
  const sepA = h.makeText('x');
  const sepB = h.makeText('x');
  row.appendChild(included.parentElement);
  row.appendChild(sepA);
  row.appendChild(weekly.parentElement);
  row.appendChild(sepB);
  row.appendChild(used.parentElement);
  const { root, body } = mount([row], h);
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary: compiled,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 2000,
  });
  assert.equal(included.nodeValue, '已包含在 Ultra 中');
  assert.equal(weekly.nodeValue, '每周用量上限');
  assert.equal(used.nodeValue, '已用 5%');
  assert.equal(sepA.nodeValue, 'x');
  assert.equal(sepB.nodeValue, 'x');
  assert.equal(row.childNodes.length, 5);
});

test('a short label beside a button is not left in English', () => {
  const dictionary = {
    exact: new Map([
      ['Settings', '设置'],
      ['Save', '保存'],
    ]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const row = h.makeElement('DIV');
  const label = h.makeText('Settings');
  const gap = h.makeText(' ');
  const button = h.makeElement('BUTTON');
  const action = h.makeText('Save');
  button.appendChild(action);
  row.appendChild(label);
  row.appendChild(gap);
  row.appendChild(button);
  const { root, body } = mount([row], h);
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 2000,
  });
  assert.equal(label.nodeValue, '设置');
  assert.equal(action.nodeValue, '保存');
});

test('a tip with an inline code token keeps that element', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const tip = h.makeElement('P');
  const lead = h.makeText('Use ');
  const code = h.makeElement('CODE');
  const token = h.makeText('/simplify');
  code.appendChild(token);
  const rest = h.makeText(' to have Cursor review all changed files for code quality and efficiency');
  tip.appendChild(lead);
  tip.appendChild(code);
  tip.appendChild(rest);
  const { root, body } = mount([tip], h);
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary: compiled,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 2000,
  });
  assert.equal(token.nodeValue, '/simplify');
  assert.equal(code.childNodes.length, 1);
  assert.match(lead.nodeValue, /使用/);
  assert.match(rest.nodeValue, /审查/);
  assert.equal(`${lead.nodeValue}${token.nodeValue}${rest.nodeValue}`, compiled.exact.get(
    'Use /simplify to have Cursor review all changed files for code quality and efficiency',
  ));
});

test('the first document walk waits for idle, and new nodes use the soon scheduler', () => {
  const dictionary = {
    exact: new Map([
      ['Cancel', '取消'],
      ['Archive', '归档'],
    ]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const first = h.makeText('Cancel');
  const { root, body } = mount([first], h);
  const idle = [];
  const soon = [];
  const byId = new Map();
  let nextId = 1;
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 2000,
    scheduleIdle(fn) {
      const id = nextId;
      nextId += 1;
      idle.push(fn);
      byId.set(id, fn);
      return id;
    },
    scheduleSoon(fn) {
      soon.push(fn);
    },
    cancelIdle(id) {
      const fn = byId.get(id);
      const index = idle.indexOf(fn);
      if (index >= 0) idle.splice(index, 1);
      byId.delete(id);
    },
  });
  assert.equal(first.nodeValue, 'Cancel');
  assert.ok(idle.length >= 1);
  assert.equal(soon.length, 0);
  const added = h.makeElement('DIV');
  const archive = h.makeText('Archive');
  added.appendChild(archive);
  body.appendChild(added);
  h.observerRef.current.emit([{ type: 'childList', addedNodes: [added] }]);
  assert.equal(archive.nodeValue, '归档');
  assert.equal(soon.length, 0);
  assert.equal(first.nodeValue, 'Cancel');
  assert.ok(idle.length >= 1);
  let guard = 0;
  while (idle.length) {
    const batch = idle.splice(0, idle.length);
    for (const fn of batch) fn();
    guard += 1;
    if (guard > 20) throw new Error('idle walk did not settle');
  }
  assert.equal(first.nodeValue, '取消');
});

test('every runtime regular expression stays linear on long inputs', () => {
  const { compiled } = loadDictionary();
  const inputs = [
    'a'.repeat(2000),
    '1'.repeat(2000),
    `Included usage with your subscription. Resets ${'a.'.repeat(500)}`,
    'x'.repeat(2000),
  ];
  for (const entry of compiled.regex) {
    for (const input of inputs) {
      entry.re.lastIndex = 0;
      const started = performance.now();
      entry.re.test(input);
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 30, `${entry.id} took ${elapsed.toFixed(1)}ms`);
    }
  }
});

function visibleText(el) {
  let out = '';
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child.nodeType === 3) out += child.nodeValue || '';
    else if (child.nodeType === 1) out += visibleText(child);
  }
  return out;
}

function renderTip(h, sentence) {
  const tip = h.makeElement('P');
  const parts = sentence.split(/(\s+)/);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith('/') || part.startsWith('@')) {
      const span = h.makeElement('SPAN');
      span.appendChild(h.makeText(part));
      tip.appendChild(span);
    } else {
      tip.appendChild(h.makeText(part));
    }
  }
  return tip;
}

function translateTree(nodes, dictionary) {
  const h = harness();
  const { root, body } = mount(nodes, h);
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 2000,
  });
  return h;
}

test('every rotating tip renders with its slash token kept', () => {
  const { compiled } = loadDictionary();
  const tips = [
    'Use /goal to set an objective that Cursor keeps pursuing until it is complete',
    'Use /cloud to run agents remotely for better parallelization and durable execution',
    'Use /in-cloud to start a subagent in its own cloud VM, keeping your local workspace free',
    'Use /review for an agentic code review of your changes',
    'Use /automate to create Cursor Automations without leaving your agent chat',
    'Use /add-plugin to install a plugin from the Cursor Marketplace',
    'Use /simplify to have Cursor review all changed files for code quality and efficiency',
    'Use /in-cloud for cloud subagents',
    'Use /review to have Cursor find bugs, regressions, security issues, and missing tests',
    'Use /create-subagent to set up specialized agents that Cursor can use to parallelize work',
    'Use /plan to improve agent execution with Plan Mode',
    'Use /create-skill to customize Cursor for your workflows',
    'Plugins help you customize Cursor for your workflows - use /add-plugin to get started',
    'Ask Mode uses read-only agents to research your codebase - hit shift+tab to get started',
    'Use /shell to run commands in the terminal',
    'Use /canvas to get interactive visualizations like dashboards from Cursor',
    'Use @browser to inspect page elements, view console logs, and analyze network traffic',
    'After long sessions, use /split-to-prs to turn your work into small, reviewable PRs',
  ];
  const h = harness();
  const rendered = tips.map((sentence) => renderTip(h, sentence));
  assert.ok(rendered[0].childNodes.length > 24, `goal tip has ${rendered[0].childNodes.length} nodes`);
  translateTree(rendered, compiled);
  for (let i = 0; i < tips.length; i += 1) {
    const expected = compiled.exact.get(tips[i]);
    assert.ok(expected, tips[i]);
    const token = tips[i].match(/\/[a-z-]+|@[a-z-]+|shift\+tab/);
    assert.equal(visibleText(rendered[i]), expected, tips[i]);
    if (token) assert.ok(visibleText(rendered[i]).includes(token[0]), tips[i]);
  }
});

test('a parent sentence wins over short labels inside it', () => {
  const { compiled } = loadDictionary();
  const english = 'Messages sent while Cursor is working can steer it mid-run without interrupting - turn it on under New Messages in Agent settings';
  const h = harness();
  const tip = h.makeElement('P');
  const parts = english.split(/(\s+)/);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (part === 'New' || part === 'Agent') {
      const span = h.makeElement('SPAN');
      span.appendChild(h.makeText(part));
      tip.appendChild(span);
    } else {
      tip.appendChild(h.makeText(part));
    }
  }
  assert.ok(tip.childNodes.length > 24);
  translateTree([tip], compiled);
  const text = visibleText(tip);
  assert.equal(text, compiled.exact.get(english));
  assert.equal(text.includes('新建'), false);
  assert.ok(text.includes('新消息'));
});

test('split usage phrases translate without swallowing sibling labels', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const used = h.makeElement('SPAN');
  used.appendChild(h.makeText('5'));
  used.appendChild(h.makeText('% used'));
  const money = h.makeElement('SPAN');
  const amount = h.makeElement('SPAN');
  amount.appendChild(h.makeText('$0.00'));
  const rest = h.makeElement('SPAN');
  rest.appendChild(h.makeText(' remaining'));
  money.appendChild(amount);
  money.appendChild(rest);
  const lone = h.makeElement('SPAN');
  lone.appendChild(h.makeText('% used'));
  const row = h.makeElement('DIV');
  const included = h.makeElement('SPAN');
  included.appendChild(h.makeText('Included in Ultra'));
  const weekly = h.makeElement('SPAN');
  weekly.appendChild(h.makeText('Weekly usage limit'));
  row.appendChild(included);
  row.appendChild(h.makeText('x'));
  row.appendChild(weekly);
  row.appendChild(h.makeText('x'));
  row.appendChild(used);
  translateTree([money, lone, row], compiled);
  assert.equal(visibleText(used), '已用 5%');
  assert.equal(visibleText(money), '剩余 $0.00');
  assert.equal(visibleText(lone), '% 已用');
  assert.equal(visibleText(included), '已包含在 Ultra 中');
  assert.equal(visibleText(weekly), '每周用量上限');
  assert.equal(visibleText(row).includes('已包含在 Ultrax'), false);
});

test('Browse Marketplace split across a span uses the parent sentence', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const button = h.makeElement('BUTTON');
  button.appendChild(h.makeText('Browse'));
  const span = h.makeElement('SPAN');
  span.appendChild(h.makeText(' Marketplace'));
  button.appendChild(span);
  translateTree([button], compiled);
  assert.equal(visibleText(button), '浏览市场');
});

test('a New badge is 新 and a New button stays 新建', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const badge = h.makeElement('SPAN', { attrs: { 'data-testid': 'model-picker-badge' } });
  badge.appendChild(h.makeText('New'));
  const chip = h.makeElement('SPAN', { classes: ['cursor-badge'] });
  chip.appendChild(h.makeText('New'));
  const button = h.makeElement('BUTTON');
  button.appendChild(h.makeText('New'));
  const picker = h.makeElement('DIV', { classes: ['ui-model-picker__item-content-name'] });
  const markdown = h.makeElement('DIV', { classes: ['markdown-root'] });
  markdown.appendChild(h.makeText('Inherit from parent'));
  picker.appendChild(markdown);
  const chat = h.makeElement('DIV', { classes: ['markdown-root'] });
  chat.appendChild(h.makeText('Inherit from parent'));
  translateTree([badge, chip, button, picker, chat], compiled);
  assert.equal(visibleText(badge), '新');
  assert.equal(visibleText(chip), '新');
  assert.equal(visibleText(button), '新建');
  const row = h.makeElement('SPAN');
  const rowBadge = h.makeElement('SPAN', { attrs: { 'data-testid': 'model-picker-badge' } });
  rowBadge.appendChild(h.makeText('New'));
  row.appendChild(rowBadge);
  translateTree([row], compiled);
  assert.equal(visibleText(rowBadge), '新');
  assert.equal(visibleText(picker), '继承自父级');
  assert.equal(visibleText(chat), 'Inherit from parent');
});

test('a large mutation stays on the soon scheduler', () => {
  const dictionary = {
    exact: new Map([['Cancel', '取消']]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const { root, body } = mount([], h);
  const soon = [];
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 2000,
    scheduleSoon(fn) {
      soon.push(fn);
    },
    scheduleIdle(fn) {
      soon.push(fn);
    },
  });
  const added = h.makeElement('DIV');
  const texts = [];
  for (let i = 0; i < 1600; i += 1) {
    const node = h.makeText('Cancel');
    texts.push(node);
    added.appendChild(node);
  }
  body.appendChild(added);
  h.observerRef.current.emit([{ type: 'childList', addedNodes: [added] }]);
  assert.equal(texts.some((node) => node.nodeValue === 'Cancel'), true);
  assert.equal(texts.some((node) => node.nodeValue === '取消'), true);
  assert.ok(soon.length >= 1);
  let guard = 0;
  while (soon.length) {
    const batch = soon.splice(0, soon.length);
    for (const fn of batch) fn();
    guard += 1;
    if (guard > 20) throw new Error('large batch did not settle');
  }
  for (const node of texts) assert.equal(node.nodeValue, '取消');
});

test('a mutation that exceeds the sync time budget defers the rest', () => {
  const dictionary = {
    exact: new Map([['Save', '保存']]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const { root, body } = mount([], h);
  const soon = [];
  let calls = 0;
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now() {
      calls += 1;
      return calls < 12 ? 0 : 10;
    },
    budgetMs: 2000,
    scheduleSoon(fn) {
      soon.push(fn);
    },
    scheduleIdle() {},
  });
  const added = h.makeElement('DIV');
  const texts = [];
  for (let i = 0; i < 30; i += 1) {
    const node = h.makeText('Save');
    texts.push(node);
    added.appendChild(node);
  }
  body.appendChild(added);
  h.observerRef.current.emit([{ type: 'childList', addedNodes: [added] }]);
  assert.equal(texts.some((node) => node.nodeValue === 'Save'), true);
  assert.ok(soon.length >= 1);
  let guard = 0;
  while (soon.length) {
    const batch = soon.splice(0, soon.length);
    for (const fn of batch) {
      calls = 0;
      fn();
    }
    guard += 1;
    if (guard > 20) throw new Error('timed batch did not settle');
  }
  for (const node of texts) assert.equal(node.nodeValue, '保存');
});

test('a home-sized remount finishes inside the synchronous batch', () => {
  const dictionary = {
    exact: new Map([['Start from scratch', '从零开始']]),
    fragments: [],
    regex: [],
  };
  const h = harness();
  const { root, body } = mount([], h);
  const soon = [];
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    dictionary,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: {},
    now: () => 0,
    budgetMs: 2000,
    scheduleSoon(fn) {
      soon.push(fn);
    },
    scheduleIdle(fn) {
      soon.push(fn);
    },
  });
  const added = h.makeElement('DIV');
  const texts = [];
  for (let i = 0; i < 400; i += 1) {
    const node = h.makeText('Start from scratch');
    texts.push(node);
    added.appendChild(node);
  }
  body.appendChild(added);
  h.observerRef.current.emit([{ type: 'childList', addedNodes: [added] }]);
  for (const node of texts) assert.equal(node.nodeValue, '从零开始');
  for (const fn of soon) fn();
});

test('a key chip stays inside the translated home tip', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const tip = h.makeElement('P');
  tip.appendChild(h.makeText('Ask Mode uses read-only agents to research your codebase - hit '));
  const kbd = h.makeElement('KBD', { classes: ['ui-kbd'] });
  kbd.appendChild(h.makeText('shift+tab'));
  tip.appendChild(kbd);
  tip.appendChild(h.makeText(' to get started'));
  translateTree([tip], compiled);
  assert.equal(
    visibleText(tip),
    '提问模式用只读智能体研究代码库。按 shift+tab 开始。',
  );
  assert.equal(kbd.childNodes[0].nodeValue, 'shift+tab');
});

test('report lists English leftovers with a reason', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const menu = h.makeElement('DIV');
  menu.appendChild(h.makeText('Mark All as Read'));
  const chat = h.makeElement('DIV', { classes: ['markdown-root'] });
  chat.appendChild(h.makeText('Worked for 6s'));
  const unknown = h.makeElement('SPAN');
  unknown.appendChild(h.makeText('Zzzz unlisted phrase'));
  const field = h.makeElement('INPUT');
  field.setAttribute('placeholder', 'Search or enter URL...');
  const { root, body } = mount([menu, chat, unknown, field], h);
  const windowHost = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    skipReason,
    dictionary: compiled,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: windowHost,
    now: () => 0,
    budgetMs: 2000,
  });
  assert.equal(menu.childNodes[0].nodeValue, '全部标为已读');
  assert.equal(field.attrs.placeholder, '搜索或输入 URL...');
  const report = windowHost.__cursorZhHans.report();
  const texts = report.entries.filter((entry) => entry.kind === 'text');
  const skipped = texts.find((entry) => entry.text === 'Worked for 6s');
  const missed = texts.find((entry) => entry.text === 'Zzzz unlisted phrase');
  assert.equal(skipped.reason, 'skipped');
  assert.equal(skipped.detail, 'class:markdown-root');
  assert.match(skipped.path, /markdown-root/);
  assert.equal(missed.reason, 'no dictionary match');
  assert.equal(texts.some((entry) => entry.text === '全部标为已读'), false);
  assert.equal(texts.some((entry) => entry.text === 'Mark All as Read'), false);
});

test('a whole 6% used label translates', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const label = h.makeElement('SPAN');
  label.appendChild(h.makeText('6% used'));
  const worked = h.makeElement('SPAN');
  worked.appendChild(h.makeText('Worked for 6s'));
  translateTree([label, worked], compiled);
  assert.equal(visibleText(label), '已用 6%');
  assert.equal(visibleText(worked), '工作了 6 秒');
});

function wordTip(h, sentence, chipWord) {
  const tip = h.makeElement('SPAN', { classes: ['ui-text'] });
  const parts = sentence.split(/(\s+)/);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (part === chipWord) {
      const kbd = h.makeElement('KBD', { classes: ['ui-kbd'] });
      kbd.appendChild(h.makeText(part));
      tip.appendChild(kbd);
    } else {
      const span = h.makeElement('SPAN');
      span.appendChild(h.makeText(part));
      tip.appendChild(span);
    }
  }
  return tip;
}

test('a word-span home tip translates as one sentence and keeps the key chip', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const english = 'Plan Mode improves agent outcomes and accuracy - hit shift+tab to get started';
  const plain = 'Use /create-rule to control agent behavior through system-level instructions';
  const tip = wordTip(h, english, 'shift+tab');
  const rule = wordTip(h, plain, null);
  const spacers = [];
  for (let i = 0; i < 90; i += 1) spacers.push(h.makeText(' '));
  for (const spacer of spacers) rule.appendChild(spacer);
  assert.ok(rule.childNodes.length > 80);
  const loose = h.makeElement('SPAN', { classes: ['ui-text'] });
  for (const word of ['Please', 'New', 'leave', 'this', 'whole', 'sentence']) {
    const span = h.makeElement('SPAN');
    span.appendChild(h.makeText(word));
    loose.appendChild(span);
  }
  translateTree([tip, rule, loose], compiled);
  assert.equal(visibleText(tip), compiled.exact.get(english));
  assert.equal(tip.childNodes.find((node) => node.tagName === 'KBD').childNodes[0].nodeValue, 'shift+tab');
  assert.equal(visibleText(rule), compiled.exact.get(plain));
  assert.equal(loose.childNodes[1].childNodes[0].nodeValue, 'New');
  assert.equal(visibleText(loose), 'PleaseNewleavethiswholesentence');
});

test('report skips css-covered composer placeholders and hidden nodes', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const editor = h.makeElement('DIV', {
    classes: ['tiptap', 'ProseMirror'],
    editable: true,
    attrs: {
      'aria-label': 'Prompt',
      'aria-placeholder': 'Plan, Build, / for skills, @ for context',
    },
  });
  const hidden = h.makeElement('DIV');
  hidden.style = { display: 'none' };
  hidden.appendChild(h.makeText('Zzzz hidden english'));
  const zero = h.makeElement('DIV');
  zero.getBoundingClientRect = () => ({ width: 0, height: 0 });
  zero.appendChild(h.makeText('Zzzz zero english'));
  const shown = h.makeElement('SPAN');
  shown.appendChild(h.makeText('Zzzz still english'));
  const { root, body } = mount([editor, hidden, zero, shown], h);
  const windowHost = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    skipReason,
    dictionary: compiled,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: windowHost,
    now: () => 0,
    budgetMs: 2000,
  });
  assert.equal(editor.attrs['aria-label'], '提示');
  assert.equal(editor.attrs['aria-placeholder'], 'Plan, Build, / for skills, @ for context');
  const all = windowHost.__cursorZhHans.report();
  assert.equal(all.entries.some((entry) => entry.text.startsWith('Plan, Build')), false);
  assert.equal(all.entries.some((entry) => entry.text === 'Zzzz hidden english'), true);
  const visible = windowHost.__cursorZhHans.report({ visibleOnly: true });
  assert.equal(visible.entries.some((entry) => entry.text === 'Zzzz hidden english'), false);
  assert.equal(visible.entries.some((entry) => entry.text === 'Zzzz zero english'), false);
  assert.equal(visible.entries.some((entry) => entry.text === 'Zzzz still english'), true);
});

test('effort, usage, and timestamp labels stay in their own slots', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const picker = h.makeElement('DIV', { classes: ['ui-model-picker__menu'] });
  const effort = h.makeElement('SPAN');
  effort.appendChild(h.makeText('High Fast\u200b\u200b'));
  const medium = h.makeElement('SPAN');
  medium.appendChild(h.makeText('Medium'));
  picker.appendChild(effort);
  picker.appendChild(medium);
  const modelName = h.makeElement('SPAN');
  modelName.appendChild(h.makeText('High'));
  const usage = h.makeElement('DIV');
  const percent = h.makeElement('SPAN');
  percent.appendChild(h.makeText('12%'));
  const used = h.makeElement('SPAN');
  used.appendChild(h.makeText('used'));
  usage.appendChild(percent);
  usage.appendChild(used);
  const lone = h.makeElement('CODE');
  lone.appendChild(h.makeText('used'));
  const side = h.makeElement('SPAN', { classes: ['agent-tab-timestamp'] });
  side.appendChild(h.makeText('7h'));
  const palette = h.makeElement('DIV', { attrs: { 'data-component': 'palette-item' } });
  const title = h.makeElement('SPAN');
  title.appendChild(h.makeText('Fix the build'));
  const age = h.makeElement('SPAN');
  age.appendChild(h.makeText('4m'));
  palette.appendChild(title);
  palette.appendChild(age);
  const file = h.makeElement('DIV', { attrs: { 'data-component': 'palette-item' } });
  file.appendChild(h.makeText('1m'));
  const loose = h.makeElement('SPAN');
  loose.appendChild(h.makeText('2d'));
  translateTree([picker, modelName, usage, lone, side, palette, file, loose], compiled);
  assert.equal(effort.childNodes[0].nodeValue, '高·快速');
  assert.equal(medium.childNodes[0].nodeValue, '中');
  assert.equal(modelName.childNodes[0].nodeValue, 'High');
  assert.equal(percent.childNodes[0].nodeValue, '已用 12%');
  assert.equal(used.childNodes[0].nodeValue, '');
  assert.equal(lone.childNodes[0].nodeValue, 'used');
  assert.equal(side.childNodes[0].nodeValue, '7小时');
  assert.equal(age.childNodes[0].nodeValue, '4分钟');
  assert.equal(file.childNodes[0].nodeValue, '1m');
  assert.equal(loose.childNodes[0].nodeValue, '2d');
});

test('shadow menus and zero-size portals are translated and reported', () => {
  const { compiled } = loadDictionary();
  const h = harness();
  const author = h.makeElement('SPAN');
  author.appendChild(h.makeText('Author'));
  const shadow = h.makeElement('DIV');
  shadow.appendChild(author);
  shadow.appendChild(h.makeText('Zzzz shadow english'));
  const host = h.makeElement('DIV', { shadowRoot: shadow });
  const portal = h.makeElement('DIV');
  portal.getBoundingClientRect = () => ({ width: 0, height: 0 });
  const menu = h.makeElement('DIV');
  menu.getBoundingClientRect = () => ({ width: 160, height: 28 });
  menu.appendChild(h.makeText('Filter By'));
  menu.appendChild(h.makeText('Zzzz portal english'));
  portal.appendChild(menu);
  const outside = h.makeElement('DIV', { classes: ['context-view'] });
  outside.appendChild(h.makeText('Most Used'));
  const { root, body } = mount([host, portal], h);
  root.appendChild(outside);
  const windowHost = {};
  startDomTranslator({
    translateText,
    shouldSkipElement,
    shouldSkipAttributeTarget,
    skipReason,
    dictionary: compiled,
    version: 'budget',
  }, {
    document: { body, documentElement: root },
    MutationObserver: h.MockObserver,
    Element: class {},
    window: windowHost,
    now: () => 0,
    budgetMs: 2000,
  });
  assert.equal(author.childNodes[0].nodeValue, '作者');
  assert.equal(menu.childNodes[0].nodeValue, '筛选');
  assert.equal(outside.childNodes[0].nodeValue, '最常使用');
  const visible = windowHost.__cursorZhHans.report({ visibleOnly: true });
  assert.equal(visible.entries.some((entry) => entry.text === 'Zzzz portal english'), true);
  assert.equal(visible.entries.some((entry) => entry.text === 'Zzzz shadow english'), true);
  assert.equal(visible.entries.some((entry) => entry.text === 'Filter By'), false);
});
