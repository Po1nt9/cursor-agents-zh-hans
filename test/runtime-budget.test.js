import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDictionary } from '../src/dictionary.js';
import { startDomTranslator } from '../src/dom.js';
import {
  compileDictionary,
  shouldSkipAttributeTarget,
  shouldSkipElement,
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
      classList: { contains: (name) => classes.includes(name) },
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
  assert.equal(used.nodeValue, '已使用 5%');
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
  assert.ok(soon.length >= 1);
  let guard = 0;
  while (soon.length) {
    const batch = soon.splice(0, soon.length);
    for (const fn of batch) fn();
    guard += 1;
    if (guard > 20) throw new Error('soon walk did not settle');
  }
  assert.equal(first.nodeValue, '取消');
  assert.equal(archive.nodeValue, '归档');
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
