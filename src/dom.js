/**
 * DOM half of the runtime. Observes mutations and translates only touched nodes.
 * The import below is stripped when this file is inlined after engine.js.
 *
 * Do not read an element's full rendered text. That copies the whole subtree,
 * and doing it once per sibling made startup quadratic: a few thousand labels
 * blocked the renderer for minutes.
 */

import { buildPlaceholderCss } from './engine.js';

export const TRANSLATABLE_ATTRS = [
  'title',
  'placeholder',
  'data-placeholder',
  'aria-label',
  'aria-description',
  'aria-placeholder',
];

const WRITE_LIMIT = 2;
const COOLDOWN_MS = 800;
const CHUNK_STEPS = 500;
const CHUNK_MS = 12;
const TEXT_LIMIT = 600;
const CORE_LIMIT = 500;
const WIDE_CHILDREN = 24;
const ANCESTOR_DEPTH = 6;
const NODE_TRANSLATE_BUDGET = 12;
const BURST_STEP_CAP = 2000000;
const LOOP_WINDOW_MS = 1000;
const LOOP_LIMIT = 8;
const BUDGET_WINDOW_MS = 2000;

export function startDomTranslator(api, env) {
  const { translateText, shouldSkipElement, dictionary, version } = api;
  const shouldSkipAttributeTarget = api.shouldSkipAttributeTarget || shouldSkipElement;
  const document = env.document;
  const MutationObserver = env.MutationObserver;
  const host = env.window || env.globalThis || {};
  if (!document || typeof MutationObserver !== 'function') {
    throw new Error('运行环境缺少 document 或 MutationObserver');
  }
  if (host.__cursorZhHansInstalled) {
    return { already: true, disconnect() {} };
  }
  host.__cursorZhHansInstalled = true;
  host.__cursorZhHans = { version: version || '0.1.0' };

  const textMemo = new WeakMap();
  const attrMemo = new WeakMap();
  const writeState = new WeakMap();
  const observed = new WeakSet();
  const queue = [];
  const budgetMs = Number.isFinite(env.budgetMs) ? env.budgetMs : 2000;
  const clock = typeof env.now === 'function' ? env.now : () => Date.now();
  const attrWrites = new Map();
  const suppressedAttrs = new Set();
  const charges = [];

  let observer = null;
  let killed = false;
  let pumping = false;
  let scheduled = false;
  let spent = 0;
  let burst = 0;
  let burstSteps = 0;
  let nodeCalls = 0;
  let scheduleMode = null;
  let placeholderStyle = null;
  let restoreAttach;

  function now() {
    return clock();
  }

  function kill() {
    if (killed) return;
    disconnect();
  }

  function stateOf(node) {
    let state = writeState.get(node);
    if (!state) {
      state = { count: 0, cooledUntil: 0, burst: 0 };
      writeState.set(node, state);
    }
    return state;
  }

  function cooled(node) {
    const state = writeState.get(node);
    if (!state || state.count < WRITE_LIMIT) return false;
    if (now() >= state.cooledUntil) {
      state.count = 0;
      return false;
    }
    return true;
  }

  function noteWrite(node) {
    const state = stateOf(node);
    if (state.burst === burst) return;
    state.burst = burst;
    state.count += 1;
    if (state.count >= WRITE_LIMIT) state.cooledUntil = now() + COOLDOWN_MS;
  }

  function elementText(el, cap) {
    const limit = cap || TEXT_LIMIT;
    if (!el || el.nodeType !== 1) return '';
    const children = el.childNodes || [];
    if (children.length > WIDE_CHILDREN) return null;
    let out = '';
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType === 3) out += child.nodeValue || '';
      else if (child.nodeType === 1 && !shouldSkipElement(child)) {
        const piece = elementText(child, limit - out.length);
        if (piece == null) return null;
        out += piece;
      }
      if (out.length > limit) return out;
    }
    return out;
  }

  function normalized(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function continuesSentence(hostText, core) {
    if (hostText == null) return false;
    const all = normalized(hostText);
    if (!all || all === core) return false;
    const idx = all.indexOf(core);
    if (idx < 0) return false;
    return /^\s+[A-Za-z]{2,}/.test(all.slice(idx + core.length));
  }

  function collectTextNodes(el, into) {
    const children = el.childNodes || [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType === 3) into.push(child);
      else if (child.nodeType === 1 && !shouldSkipElement(child)) collectTextNodes(child, into);
    }
  }

  function budgetedTranslate(text) {
    nodeCalls += 1;
    if (nodeCalls > NODE_TRANSLATE_BUDGET) return { text, changed: false, tier: null };
    return translateText(text, dictionary);
  }

  function writeText(node, text) {
    if (node.nodeValue === text) {
      textMemo.set(node, text);
      return true;
    }
    textMemo.set(node, text);
    noteWrite(node);
    node.nodeValue = text;
    return true;
  }

  function applyWhole(el, translated) {
    const nodes = [];
    collectTextNodes(el, nodes);
    const meaningful = [];
    for (let i = 0; i < nodes.length; i += 1) {
      if (nodes[i].nodeValue && String(nodes[i].nodeValue).trim()) meaningful.push(nodes[i]);
    }
    if (!meaningful.length) return;
    if (cooled(meaningful[0]) && meaningful[0].nodeValue !== translated) return;
    if (!writeText(meaningful[0], translated)) return;
    for (let i = 1; i < meaningful.length; i += 1) {
      if (cooled(meaningful[i]) && meaningful[i].nodeValue !== '') continue;
      writeText(meaningful[i], '');
    }
  }

  function narrowText(el) {
    if (!el || el.nodeType !== 1) return null;
    const kids = el.childNodes || [];
    if (kids.length > WIDE_CHILDREN) return null;
    const raw = elementText(el, TEXT_LIMIT);
    if (raw == null || raw.length > CORE_LIMIT) return null;
    return raw;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    if (cooled(node)) return;
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;
    if (textMemo.get(node) === node.nodeValue) return;

    nodeCalls = 0;
    let best = null;
    let host = parent;
    for (let depth = 0; depth < ANCESTOR_DEPTH && host; depth += 1) {
      if (shouldSkipElement(host)) break;
      const raw = narrowText(host);
      if (raw == null) break;
      const compact = normalized(raw);
      if (compact) {
        const whole = budgetedTranslate(compact);
        if (whole.changed) best = { host, text: whole.text };
      }
      host = host.parentElement || null;
    }

    if (best) {
      const compact = normalized(narrowText(best.host) || '');
      const short = compact.length <= 24 && compact.indexOf(' ') === -1;
      const above = best.host.parentElement;
      const aboveText = short && above ? narrowText(above) : null;
      if (!(short && above && continuesSentence(aboveText, compact))) {
        applyWhole(best.host, best.text);
        return;
      }
    }

    const core = normalized(node.nodeValue);
    const parentText = narrowText(parent);
    if (core && core.indexOf(' ') === -1 && core.length <= 24 && continuesSentence(parentText, core)) {
      textMemo.set(node, node.nodeValue);
      return;
    }

    const result = budgetedTranslate(node.nodeValue);
    if (!result.changed || result.text === node.nodeValue) {
      textMemo.set(node, node.nodeValue);
      return;
    }
    if (cooled(node)) return;
    writeText(node, result.text);
  }

  function attrMemoOf(el) {
    let memo = attrMemo.get(el);
    if (!memo) {
      memo = Object.create(null);
      attrMemo.set(el, memo);
    }
    return memo;
  }

  function translateAttrs(el) {
    if (!el || el.nodeType !== 1 || typeof el.getAttribute !== 'function') return;
    if (shouldSkipAttributeTarget(el)) return;
    if (cooled(el)) return;
    nodeCalls = 0;
    const memo = attrMemoOf(el);
    for (let i = 0; i < TRANSLATABLE_ATTRS.length; i += 1) {
      const attr = TRANSLATABLE_ATTRS[i];
      if (typeof el.hasAttribute === 'function' && !el.hasAttribute(attr)) continue;
      const raw = el.getAttribute(attr);
      if (raw == null || memo[attr] === raw) continue;
      const result = budgetedTranslate(raw);
      if (!result.changed || result.text === raw) {
        memo[attr] = raw;
        continue;
      }
      if (cooled(el)) return;
      if (attributeLooping(attr, raw)) return;
      memo[attr] = result.text;
      noteWrite(el);
      el.setAttribute(attr, result.text);
    }
  }

  function attributeLooping(name, source) {
    const key = `${name}\n${source}`;
    if (suppressedAttrs.has(key)) return true;
    const t = now();
    const prev = attrWrites.get(key);
    const fresh = [];
    if (prev) {
      for (let i = 0; i < prev.length; i += 1) {
        if (t - prev[i] < LOOP_WINDOW_MS) fresh.push(prev[i]);
      }
    }
    if (fresh.length >= LOOP_LIMIT) {
      suppressedAttrs.add(key);
      attrWrites.set(key, fresh);
      return true;
    }
    fresh.push(t);
    attrWrites.set(key, fresh);
    return false;
  }

  function enqueue(item) {
    if (!killed && item) queue.push(item);
  }

  function visit(item) {
    if (!item || killed) return;
    if (item.type === 'characterData') {
      translateTextNode(item.target);
      return;
    }
    if (item.type === 'attributes') {
      translateAttrs(item.target);
      return;
    }
    if (item.type === 'childList') {
      const added = item.addedNodes || [];
      for (let i = added.length - 1; i >= 0; i -= 1) enqueue(added[i]);
      return;
    }
    const node = item;
    if (node.nodeType === 3) {
      translateTextNode(node);
      return;
    }
    if (node.nodeType === 11) {
      const children = node.childNodes || [];
      for (let i = children.length - 1; i >= 0; i -= 1) enqueue(children[i]);
      return;
    }
    if (node.nodeType !== 1) return;
    if (shouldSkipAttributeTarget(node)) return;
    translateAttrs(node);
    if (node.shadowRoot) {
      observe(node.shadowRoot);
      enqueue(node.shadowRoot);
    }
    const children = node.childNodes || [];
    for (let i = children.length - 1; i >= 0; i -= 1) enqueue(children[i]);
  }

  function usesAsyncSchedule() {
    if (typeof env.schedule !== 'function') return false;
    if (scheduleMode === 'async') return true;
    if (scheduleMode === 'sync') return false;
    let ran = false;
    env.schedule(() => {
      ran = true;
    });
    scheduleMode = ran ? 'sync' : 'async';
    return scheduleMode === 'async';
  }

  function yieldToHost(continuation) {
    if (!usesAsyncSchedule()) return false;
    scheduled = true;
    env.schedule(() => {
      scheduled = false;
      continuation();
    });
    return true;
  }

  function charge(dt) {
    const amount = Math.max(0, dt);
    if (!amount) return;
    const t = now();
    charges.push({ t, dt: amount });
    const horizon = t - BUDGET_WINDOW_MS;
    while (charges.length && charges[0].t < horizon) charges.shift();
    let total = 0;
    for (let i = 0; i < charges.length; i += 1) total += charges[i].dt;
    spent = total;
    if (spent > budgetMs) kill();
  }

  function overBudget(start) {
    if (budgetMs <= 0) return true;
    if (burstSteps > BURST_STEP_CAP) return true;
    return spent + Math.max(0, now() - start) > budgetMs;
  }

  function runChunk() {
    if (killed) {
      pumping = false;
      return;
    }
    const start0 = now();
    let windowStart = start0;
    let steps = 0;
    while (queue.length) {
      const elapsed = now() - windowStart;
      if (overBudget(start0)) {
        charge(now() - start0);
        kill();
        pumping = false;
        return;
      }
      if (steps > 0 && (steps >= CHUNK_STEPS || elapsed >= CHUNK_MS)) {
        if (yieldToHost(runChunk)) {
          charge(now() - start0);
          return;
        }
        steps = 0;
        windowStart = now();
      }
      steps += 1;
      burstSteps += 1;
      burst += 1;
      const item = queue.pop();
      try {
        visit(item);
      } catch {
        // One bad node must not wedge the pump or spin the observer.
      }
      if (killed) {
        pumping = false;
        return;
      }
    }
    charge(now() - start0);
    burstSteps = 0;
    pumping = false;
  }

  function pump() {
    if (pumping || killed) return;
    pumping = true;
    runChunk();
  }

  // Never translate inside the observer callback. A macrotask lets ProseMirror's
  // own observer return to the event loop; a synchronous reply livelocks both.
  function schedulePump() {
    if (killed || scheduled || pumping) return;
    if (!usesAsyncSchedule()) {
      pump();
      return;
    }
    scheduled = true;
    env.schedule(() => {
      scheduled = false;
      if (!killed && queue.length) pump();
    });
  }

  observer = new MutationObserver((records) => {
    if (killed) return;
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      if (record.type === 'characterData') {
        const target = record.target;
        if (target && textMemo.get(target) === target.nodeValue) continue;
      } else if (record.type === 'attributes') {
        const target = record.target;
        const name = record.attributeName;
        if (target && name && attrMemo.get(target)?.[name] === target.getAttribute?.(name)) continue;
      }
      enqueue(record);
    }
    schedulePump();
  });

  const options = {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS.slice(),
  };

  function observe(root) {
    if (!root || observed.has(root) || killed) return;
    observed.add(root);
    observer.observe(root, options);
  }

  const Element = env.Element;
  if (Element && Element.prototype && typeof Element.prototype.attachShadow === 'function') {
    const original = Element.prototype.attachShadow;
    if (!original.__cursorZhHans) {
      function wrapped(init) {
        const shadow = original.call(this, init);
        observe(shadow);
        enqueue(shadow);
        schedulePump();
        return shadow;
      }
      wrapped.__cursorZhHans = true;
      try {
        Element.prototype.attachShadow = wrapped;
        restoreAttach = () => {
          if (Element.prototype.attachShadow === wrapped) {
            Element.prototype.attachShadow = original;
          }
        };
      } catch {
        // Some embeds freeze Element.prototype. Translation of light DOM still runs.
      }
    }
  }

  function installPlaceholderStyle() {
    if (typeof document.createElement !== 'function' || typeof document.createTextNode !== 'function') return;
    const css = buildPlaceholderCss(dictionary);
    if (!css) return;
    const style = document.createElement('style');
    if (!style || typeof style.appendChild !== 'function') return;
    if (typeof style.setAttribute === 'function') style.setAttribute('data-cursor-zh-placeholders', 'true');
    style.appendChild(document.createTextNode(css));
    const parent = document.head || document.documentElement;
    if (parent && typeof parent.appendChild === 'function') parent.appendChild(style);
    placeholderStyle = style;
  }

  function disconnect() {
    killed = true;
    queue.length = 0;
    scheduled = false;
    host.__cursorZhHansKilled = true;
    if (host.__cursorZhHans) host.__cursorZhHans.killed = true;
    if (observer) {
      try {
        observer.disconnect();
      } catch {
        // The host may already have torn the observer down.
      }
    }
    if (restoreAttach) restoreAttach();
    const styleNode = placeholderStyle;
    placeholderStyle = null;
    if (styleNode && styleNode.parentNode && typeof styleNode.parentNode.removeChild === 'function') {
      styleNode.parentNode.removeChild(styleNode);
    }
    host.__cursorZhHansInstalled = false;
  }

  host.__cursorZhHans.disconnect = disconnect;
  installPlaceholderStyle();

  const target = document.documentElement || document.body;
  if (target) observe(target);
  if (document.body) enqueue(document.body);
  if (queue.length) schedulePump();

  return {
    already: false,
    observer,
    disconnect,
  };
}
