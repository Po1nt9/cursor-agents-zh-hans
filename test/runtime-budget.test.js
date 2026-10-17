import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDictionary } from '../src/dictionary.js';
import { startDomTranslator } from '../src/dom.js';
import {
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
        this.childNodes.push(child);
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
