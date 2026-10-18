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
const SENTENCE_CHILDREN = 80;
const WORD_SPAN_CAP = 200;
const SYNC_NODE_LIMIT = 1500;
const SYNC_MS = 8;
const REPORT_LIMIT = 800;
const REPORT_NODE_CAP = 60000;
const ANCESTOR_DEPTH = 6;
const NODE_TRANSLATE_BUDGET = 12;
const BURST_STEP_CAP = 2000000;
const LOOP_WINDOW_MS = 1000;
const LOOP_LIMIT = 8;
const BUDGET_WINDOW_MS = 2000;

export function startDomTranslator(api, env) {
  const { translateText, shouldSkipElement, dictionary, version } = api;
  const skipReason = api.skipReason || (() => null);
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
  const attrLoops = new WeakMap();
  const attrWrites = new Map();
  const charges = [];

  let observer = null;
  let killed = false;
  let pumping = false;
  let draining = false;
  let scheduled = false;
  let scheduledKind = null;
  let idleHandle = null;
  let preferSoon = false;
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

  const INLINE_TAGS = {
    A: 1,
    ABBR: 1,
    B: 1,
    CITE: 1,
    CODE: 1,
    EM: 1,
    I: 1,
    KBD: 1,
    MARK: 1,
    S: 1,
    SMALL: 1,
    SPAN: 1,
    STRONG: 1,
    SUB: 1,
    SUP: 1,
    TIME: 1,
    U: 1,
  };

  function isInlinePhrase(el) {
    const tag = String((el && el.tagName) || '').toUpperCase();
    if (!el || el.nodeType !== 1 || !INLINE_TAGS[tag]) return false;
    const list = el.classList;
    if (list && typeof list.contains === 'function') {
      if (
        list.contains('ui-kbd')
        || list.contains('monaco-keybinding')
        || list.contains('keybinding-key')
        || list.contains('keybinding-label')
      ) {
        return false;
      }
    }
    return true;
  }

  // Key chips stay untranslated, but they are part of the sentence around them.
  function isKeyChip(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'KBD') return true;
    const list = el.classList;
    if (list && typeof list.contains === 'function') {
      return list.contains('ui-kbd')
        || list.contains('monaco-keybinding')
        || list.contains('keybinding-key')
        || list.contains('keybinding-label');
    }
    return false;
  }

  function isPhrasePart(el) {
    return isInlinePhrase(el) || isKeyChip(el);
  }

  function elementText(el, cap) {
    const limit = cap || TEXT_LIMIT;
    if (!el || el.nodeType !== 1) return '';
    const children = el.childNodes || [];
    if (children.length > SENTENCE_CHILDREN) return null;
    let out = '';
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType === 3) out += child.nodeValue || '';
      else if (child.nodeType === 1 && isPhrasePart(child)) {
        const piece = elementText(child, limit - out.length);
        if (piece == null) return null;
        out += piece;
      }
      if (out.length > limit) return out;
    }
    return out;
  }

  // text: only text nodes. inline: every element child is phrasing. mixed: widgets.
  // Above the sentence cap, return mixed without scanning so a wide row stays O(1).
  function hostShape(el) {
    const children = el.childNodes || [];
    if (children.length > SENTENCE_CHILDREN) return 'mixed';
    let elements = 0;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType !== 1) continue;
      elements += 1;
      if (!isPhrasePart(child) || hostShape(child) === 'mixed') return 'mixed';
    }
    return elements ? 'inline' : 'text';
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
    const plan = [{ node: meaningful[0], text: translated }];
    for (let i = 0; i < nodes.length; i += 1) {
      if (nodes[i] !== meaningful[0]) plan.push({ node: nodes[i], text: '' });
    }
    for (let i = 0; i < plan.length; i += 1) {
      if (cooled(plan[i].node) && plan[i].node.nodeValue !== plan[i].text) return;
    }
    for (let i = 0; i < plan.length; i += 1) writeText(plan[i].node, plan[i].text);
  }

  function inlineToken(el) {
    return normalized(elementText(el, CORE_LIMIT) || '');
  }

  // Keep code/kbd/span nodes. Put the translation's prefix and suffix in the
  // text nodes around them. Refuse when a token is missing, so a loose match
  // cannot wipe the inline element.
  function applyInline(el, translated) {
    const kids = el.childNodes || [];
    const cuts = [];
    let pos = 0;
    for (let i = 0; i < kids.length; i += 1) {
      const child = kids[i];
      if (child.nodeType !== 1 || !isPhrasePart(child)) continue;
      const token = inlineToken(child);
      if (!token) return false;
      const at = translated.indexOf(token, pos);
      if (at < 0) return false;
      cuts.push({ at, end: at + token.length });
      pos = at + token.length;
    }
    if (!cuts.length) return false;
    const writes = [];
    let cursor = 0;
    let ti = 0;
    let gap = [];
    function takeGap(upTo) {
      const slice = translated.slice(cursor, upTo);
      cursor = upTo;
      const textNodes = gap;
      gap = [];
      if (!textNodes.length) return slice.trim().length === 0;
      writes.push({ node: textNodes[0], text: slice });
      for (let i = 1; i < textNodes.length; i += 1) writes.push({ node: textNodes[i], text: '' });
      return true;
    }
    for (let i = 0; i < kids.length; i += 1) {
      const child = kids[i];
      if (child.nodeType === 3) gap.push(child);
      else if (child.nodeType === 1 && isPhrasePart(child)) {
        if (!takeGap(cuts[ti].at)) return false;
        cursor = cuts[ti].end;
        ti += 1;
      }
    }
    if (!takeGap(translated.length)) return false;
    for (let i = 0; i < writes.length; i += 1) {
      const item = writes[i];
      if (cooled(item.node) && item.node.nodeValue !== item.text) return false;
    }
    for (let i = 0; i < writes.length; i += 1) writeText(writes[i].node, writes[i].text);
    return true;
  }

  function narrowText(el) {
    if (!el || el.nodeType !== 1) return null;
    const kids = el.childNodes || [];
    if (kids.length > SENTENCE_CHILDREN) return null;
    const raw = elementText(el, TEXT_LIMIT);
    if (raw == null || raw.length > CORE_LIMIT) return null;
    return raw;
  }

  function classTokens(el) {
    if (typeof el.className === 'string' && el.className) return el.className.split(/\s+/);
    const list = el.classList;
    if (list && typeof list[Symbol.iterator] === 'function') {
      const tokens = [];
      for (const name of list) tokens.push(name);
      return tokens;
    }
    return [];
  }

  function looksLikeBadge(el) {
    if (!el || el.nodeType !== 1) return false;
    const testid = el.getAttribute?.('data-testid') || '';
    if (/badge/i.test(String(testid))) return true;
    const list = el.classList;
    if (list && typeof list.contains === 'function') {
      if (list.contains('badge') || list.contains('pill') || list.contains('cursor-badge')) return true;
    }
    const tokens = classTokens(el);
    for (let i = 0; i < tokens.length; i += 1) {
      if (/badge|pill/i.test(tokens[i])) return true;
    }
    return false;
  }

  function isBadgeContext(el) {
    let cur = el;
    for (let i = 0; i < 4 && cur && cur.nodeType === 1; i += 1) {
      if (looksLikeBadge(cur)) return true;
      cur = cur.parentElement || null;
    }
    return false;
  }

  // A New/NEW chip is 新. The same word on a button stays 新建 via the exact map.
  function badgeLabel(host, compact) {
    if (compact !== 'New' && compact !== 'NEW') return null;
    if (!isBadgeContext(host)) return null;
    return '新';
  }

  function isCodeEl(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'CODE') return true;
    const list = el.classList;
    return Boolean(list && typeof list.contains === 'function' && list.contains('ui-markdown__inline-code'));
  }

  function isPreservedChip(el) {
    return isKeyChip(el) || isCodeEl(el);
  }

  function isSingleToken(text) {
    const core = normalized(text);
    if (!core) return true;
    if (core.length > 48) return false;
    return core.indexOf(' ') === -1;
  }

  // A word span is one token. Nested widgets are not.
  function tokenText(el, depth) {
    if (!el || el.nodeType !== 1) return null;
    if (depth > 4) return null;
    const children = el.childNodes || [];
    if (children.length > 8) return null;
    let out = '';
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType === 3) out += child.nodeValue || '';
      else if (child.nodeType === 1 && isPreservedChip(child)) {
        const piece = tokenText(child, depth + 1);
        if (piece == null) return null;
        out += piece;
      } else if (child.nodeType === 1 && isPhrasePart(child)) {
        const piece = tokenText(child, depth + 1);
        if (piece == null) return null;
        out += piece;
      } else if (child.nodeType === 1) return null;
    }
    return out;
  }

  // The home tip carousel renders every word as its own span. That shape is a
  // sentence even when it has more children than the normal row cap.
  function isWordSpanSentence(el) {
    if (!el || el.nodeType !== 1) return false;
    if (shouldSkipElement(el) && !isInlinePhrase(el)) return false;
    const children = el.childNodes || [];
    if (children.length < 4 || children.length > WORD_SPAN_CAP) return false;
    let tokens = 0;
    let elements = 0;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType === 3) {
        if (!isSingleToken(child.nodeValue || '')) return false;
        if (normalized(child.nodeValue)) tokens += 1;
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (isPreservedChip(child)) {
        tokens += 1;
        elements += 1;
        continue;
      }
      if (!isPhrasePart(child)) return false;
      const piece = tokenText(child, 0);
      if (piece == null || !isSingleToken(piece)) return false;
      elements += 1;
      if (normalized(piece)) tokens += 1;
    }
    // A run of raw text nodes is a normal row. The carousel wraps each word.
    return tokens >= 6 && elements >= 4;
  }

  function sentenceFromWordSpans(el) {
    const children = el.childNodes || [];
    const parts = [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      let piece = '';
      if (child.nodeType === 3) piece = child.nodeValue || '';
      else if (child.nodeType === 1) piece = tokenText(child, 0) || '';
      if (piece) parts.push(piece);
    }
    const raw = parts.join('');
    if (/\s/.test(raw)) return normalized(raw);
    return normalized(parts.join(' '));
  }

  function flattenWordSpan(el, into) {
    const children = el.childNodes || [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.nodeType === 3) into.push({ type: 'text', node: child });
      else if (child.nodeType === 1 && isPreservedChip(child)) into.push({ type: 'chip', node: child });
      else if (child.nodeType === 1 && !shouldSkipElement(child)) flattenWordSpan(child, into);
    }
  }

  function latchWordSpan(el) {
    const flat = [];
    flattenWordSpan(el, flat);
    for (let i = 0; i < flat.length; i += 1) {
      if (flat[i].type !== 'text') continue;
      const node = flat[i].node;
      if (textMemo.get(node) !== node.nodeValue) textMemo.set(node, node.nodeValue);
    }
  }

  // The whole sentence goes in the first text span. Code and kbd stay put,
  // and the other word spans are cleared.
  function applyWordSpanSentence(el, translated) {
    const flat = [];
    flattenWordSpan(el, flat);
    const chips = [];
    for (let i = 0; i < flat.length; i += 1) {
      if (flat[i].type === 'chip') chips.push(flat[i].node);
    }
    let pos = 0;
    const cuts = [];
    let split = chips.length > 0;
    for (let i = 0; i < chips.length; i += 1) {
      const token = normalized(tokenText(chips[i], 0) || '');
      if (!token) {
        split = false;
        break;
      }
      const at = translated.indexOf(token, pos);
      if (at < 0) {
        split = false;
        break;
      }
      cuts.push({ at, end: at + token.length });
      pos = at + token.length;
    }
    const writes = [];
    if (!split) {
      let first = null;
      for (let i = 0; i < flat.length; i += 1) {
        if (flat[i].type !== 'text') continue;
        if (!first) first = flat[i].node;
        writes.push({ node: flat[i].node, text: first === flat[i].node ? translated : '' });
      }
    } else {
      let cursor = 0;
      let ci = 0;
      let gap = [];
      function takeGap(upTo) {
        const slice = translated.slice(cursor, upTo);
        cursor = upTo;
        const nodes = gap;
        gap = [];
        if (!nodes.length) return slice.trim().length === 0;
        writes.push({ node: nodes[0], text: slice });
        for (let i = 1; i < nodes.length; i += 1) writes.push({ node: nodes[i], text: '' });
        return true;
      }
      for (let i = 0; i < flat.length; i += 1) {
        if (flat[i].type === 'text') gap.push(flat[i].node);
        else if (!takeGap(cuts[ci].at)) return false;
        else {
          cursor = cuts[ci].end;
          ci += 1;
        }
      }
      if (!takeGap(translated.length)) return false;
    }
    if (!writes.length) return false;
    for (let i = 0; i < writes.length; i += 1) {
      if (cooled(writes[i].node) && writes[i].node.nodeValue !== writes[i].text) return false;
    }
    for (let i = 0; i < writes.length; i += 1) writeText(writes[i].node, writes[i].text);
    return true;
  }

  function classBlob(el) {
    if (!el || el.nodeType !== 1) return '';
    if (typeof el.className === 'string' && el.className) return el.className;
    const list = el.classList;
    if (!list || typeof list[Symbol.iterator] !== 'function') return '';
    const names = [];
    for (const name of list) names.push(name);
    return names.join(' ');
  }

  function classHas(el, needle) {
    const blob = classBlob(el);
    if (!blob) return false;
    const parts = blob.split(/\s+/);
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].includes(needle)) return true;
    }
    return false;
  }

  function stripMarks(text) {
    return String(text || '').replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  }

  // Effort names share words with model names. Only the picker suffix and menu use them.
  function effortTranslation(el, raw) {
    const core = normalized(stripMarks(raw));
    const to = core === 'High' ? '高'
      : core === 'Medium' ? '中'
        : core === 'Low' ? '低'
          : core === 'High Fast' ? '高·快速'
            : '';
    if (!to) return '';
    let cur = el;
    for (let depth = 0; depth < 8 && cur; depth += 1) {
      if (classHas(cur, 'variant-suffix') || classHas(cur, 'model-picker')) return to;
      cur = cur.parentElement || null;
    }
    return '';
  }

  function findPercentText(node, depth) {
    if (!node || depth > 4) return null;
    if (node.nodeType === 3) {
      const match = /^(\d+(?:\.\d+)?)%$/.exec(normalized(stripMarks(node.nodeValue)));
      if (!match) return null;
      return { node, value: `${match[1]}%` };
    }
    if (node.nodeType !== 1) return null;
    const kids = node.childNodes || [];
    if (kids.length > 6) return null;
    for (let i = 0; i < kids.length; i += 1) {
      const found = findPercentText(kids[i], depth + 1);
      if (found) return found;
    }
    return null;
  }

  // "8%" beside the word "used" should read 已用 8%, not 8% 已使用.
  function usedBesidePercent(node) {
    if (normalized(stripMarks(node.nodeValue)) !== 'used') return null;
    let el = node.parentElement;
    for (let depth = 0; depth < 3 && el; depth += 1) {
      const parent = el.parentElement;
      if (!parent) break;
      const kids = parent.childNodes || [];
      for (let i = 0; i < kids.length; i += 1) {
        const kid = kids[i];
        if (kid === el) continue;
        const found = findPercentText(kid, 0);
        if (found) return found;
      }
      el = parent;
    }
    return null;
  }

  function otherLabelIn(root, token) {
    const stack = [root];
    let seen = 0;
    while (stack.length && seen < 40) {
      const node = stack.pop();
      seen += 1;
      if (!node) continue;
      if (node.nodeType === 3) {
        const core = normalized(stripMarks(node.nodeValue));
        if (!core || core === token) continue;
        if (/[A-Za-z\u4e00-\u9fff]/.test(core)) return true;
        continue;
      }
      if (node.nodeType !== 1 && node.nodeType !== 11) continue;
      const kids = node.childNodes || [];
      for (let i = 0; i < kids.length; i += 1) stack.push(kids[i]);
    }
    return false;
  }

  const AGE_UNIT = { s: '秒', m: '分钟', h: '小时', d: '天', mo: '个月', y: '年' };

  function formatAge(spec) {
    return spec.map(([n, unit]) => `${n}${AGE_UNIT[unit]}`).join('');
  }

  function parseAge(core) {
    const one = /^(\d{1,4})(mo|s|m|h|d|y)$/.exec(core);
    if (one) return [[one[1], one[2]]];
    const two = /^(\d{1,4})(s|m|h|d) (\d{1,4})(s|m|h|d)$/.exec(core);
    if (two) return [[two[1], two[2]], [two[3], two[4]]];
    return null;
  }

  // Compact ages (2m, 9h, 13s) in timestamps, sidebar rows, automations, and chat.
  // A lone token such as a file named "1m" is left alone.
  function timeHost(el, token) {
    let cur = el;
    for (let depth = 0; depth < 8 && cur; depth += 1) {
      const tag = String(cur.tagName || '').toUpperCase();
      if (tag === 'CODE' || tag === 'PRE' || tag === 'KBD') return false;
      if (classHas(cur, 'timestamp') || classHas(cur, 'time-ago') || classHas(cur, 'relative-time')) {
        return true;
      }
      const component = String(cur.getAttribute?.('data-component') || '');
      if (/timestamp|time-ago|relative-time/i.test(component)) return true;
      const rowish = tag === 'LI' || tag === 'TR'
        || classHas(cur, 'agent-tab')
        || classHas(cur, 'automation')
        || classHas(cur, 'sidebar')
        || classHas(cur, 'chat-header')
        || classHas(cur, 'instance-header')
        || classHas(cur, 'row-secondary')
        || component === 'palette-item'
        || /(^|\s)(row|item|card|entry)(\s|$)/i.test(classBlob(cur));
      if (rowish && otherLabelIn(cur, token)) return true;
      cur = cur.parentElement || null;
    }
    return false;
  }

  function relativeTimeTranslation(el, raw) {
    const core = normalized(stripMarks(raw));
    const spec = parseAge(core);
    if (!spec || !timeHost(el, core)) return '';
    return formatAge(spec);
  }

  function wordSpanHost(start) {
    let host = start;
    for (let depth = 0; depth < ANCESTOR_DEPTH && host; depth += 1) {
      if (isWordSpanSentence(host)) return host;
      host = host.parentElement || null;
    }
    return null;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    if (cooled(node)) return;
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;
    if (textMemo.get(node) === node.nodeValue) return;

    const sentenceHost = wordSpanHost(parent);
    if (sentenceHost) {
      nodeCalls = 0;
      const sentence = sentenceFromWordSpans(sentenceHost);
      const whole = sentence ? budgetedTranslate(sentence) : { changed: false };
      if (whole.changed && whole.tier === 'exact' && applyWordSpanSentence(sentenceHost, whole.text)) return;
      // A single word such as New, Plan, or Use must not translate inside the carousel.
      latchWordSpan(sentenceHost);
      return;
    }

    const effort = effortTranslation(parent, node.nodeValue);
    if (effort) {
      if (!cooled(node)) writeText(node, effort);
      return;
    }
    const percent = usedBesidePercent(node);
    if (percent) {
      if (!cooled(percent.node)) writeText(percent.node, `已用 ${percent.value}`);
      if (!cooled(node)) writeText(node, '');
      return;
    }
    const age = relativeTimeTranslation(parent, node.nodeValue);
    if (age) {
      if (!cooled(node)) writeText(node, age);
      return;
    }

    nodeCalls = 0;
    let best = null;
    let host = parent;
    for (let depth = 0; depth < ANCESTOR_DEPTH && host; depth += 1) {
      if (shouldSkipElement(host) && !isInlinePhrase(host)) break;
      const shape = hostShape(host);
      // A row of separate widgets must not be one sentence. Regex on that
      // concatenation is what turned usage labels into a single garbled string.
      if (shape === 'mixed') break;
      const raw = narrowText(host);
      if (raw == null) break;
      const compact = normalized(raw);
      const badge = badgeLabel(host, compact);
      if (badge) {
        best = { host, text: badge, inline: false, tier: 'exact', badge: true };
      } else if (compact && !(best && best.badge && (compact === 'New' || compact === 'NEW'))) {
        const whole = budgetedTranslate(compact);
        const inlineExact = shape === 'inline' && whole.tier === 'exact';
        // Open patterns such as "Included in (.+)" stay off inline parents.
        // Closed ones ("5% used", "$0.00 remaining") may cover split nodes.
        const inlineClosed = shape === 'inline' && whole.tier === 'regex' && !whole.open;
        if (whole.changed && (shape === 'text' || inlineExact || inlineClosed)) {
          best = { host, text: whole.text, inline: shape === 'inline' && whole.tier === 'exact', tier: whole.tier };
        }
      }
      if (shape === 'inline') break;
      host = host.parentElement || null;
    }

    if (best) {
      // Keep slash-command spans when the translation still contains them.
      // Otherwise the parent sentence replaces every inner label.
      if (best.inline && applyInline(best.host, best.text)) return;
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
    const marked = badgeLabel(parent, core);
    if (marked) {
      if (cooled(node)) return;
      writeText(node, marked);
      return;
    }
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

  function isComposerSurface(el) {
    if (!el || el.nodeType !== 1) return false;
    const list = el.classList;
    if (list && typeof list.contains === 'function') {
      if (list.contains('ProseMirror') || list.contains('tiptap')) return true;
    }
    if (el.isContentEditable) return true;
    const editable = el.getAttribute?.('contenteditable');
    return editable != null && editable !== 'false';
  }

  function placeholderAttr(name) {
    return name === 'placeholder' || name === 'data-placeholder' || name === 'aria-placeholder';
  }

  function translateAttrs(el) {
    if (!el || el.nodeType !== 1 || typeof el.getAttribute !== 'function') return;
    const skip = shouldSkipAttributeTarget(el);
    // Placeholder text inside the composer is drawn by the injected CSS.
    // Other labels on that editor, such as aria-label Prompt, still translate.
    if (skip && !isComposerSurface(el)) return;
    if (cooled(el)) return;
    nodeCalls = 0;
    const memo = attrMemoOf(el);
    for (let i = 0; i < TRANSLATABLE_ATTRS.length; i += 1) {
      const attr = TRANSLATABLE_ATTRS[i];
      if (skip && placeholderAttr(attr)) continue;
      if (typeof el.hasAttribute === 'function' && !el.hasAttribute(attr)) continue;
      const raw = el.getAttribute(attr);
      if (raw == null || memo[attr] === raw) continue;
      const result = budgetedTranslate(raw);
      if (!result.changed || result.text === raw) {
        memo[attr] = raw;
        continue;
      }
      if (cooled(el)) return;
      if (attributeLooping(el, attr, raw)) return;
      memo[attr] = result.text;
      noteWrite(el);
      el.setAttribute(attr, result.text);
    }
  }

  // Each element gets its own budget, and the same English source also has a
  // short global window so a placeholder rebuild cannot spin. The source is
  // not banned forever: after the window, another tab can still translate.
  function attributeLooping(el, name, source) {
    const t = now();
    const key = `${name}\n${source}`;
    let global = attrWrites.get(key);
    if (!global || t - global.windowStart >= LOOP_WINDOW_MS) {
      global = { windowStart: t, count: 0 };
    }
    let state = attrLoops.get(el);
    if (!state || state.name !== name || state.source !== source) {
      state = { name, source, count: 0, coolUntil: 0 };
    } else if (state.coolUntil && t < state.coolUntil) {
      return true;
    }
    if (global.count >= LOOP_LIMIT) {
      attrWrites.set(key, global);
      state.coolUntil = t + COOLDOWN_MS;
      attrLoops.set(el, state);
      return true;
    }
    global.count += 1;
    attrWrites.set(key, global);
    state.count += 1;
    if (state.count > LOOP_LIMIT) {
      state.coolUntil = t + COOLDOWN_MS;
      attrLoops.set(el, state);
      return true;
    }
    attrLoops.set(el, state);
    return false;
  }

  function attributeCooling(el) {
    const state = attrLoops.get(el);
    return Boolean(state && state.coolUntil && now() < state.coolUntil);
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
    // The composer is skipped as an editor, except labels such as aria-label Prompt.
    // Placeholder attributes stay untouched so the injected CSS can draw them.
    if (!shouldSkipAttributeTarget(node) || isComposerSurface(node)) translateAttrs(node);
    // Chat markdown and editors stop here. A model-picker label is markdown too,
    // but its text is a control name and still needs a walk.
    if (shouldSkipElement(node) && !isInlinePhrase(node)) return;
    if (node.shadowRoot) {
      observe(node.shadowRoot);
      enqueue(node.shadowRoot);
    }
    const children = node.childNodes || [];
    for (let i = children.length - 1; i >= 0; i -= 1) enqueue(children[i]);
  }

  function scheduler(kind) {
    if (kind === 'soon' && typeof env.scheduleSoon === 'function') return env.scheduleSoon;
    if (kind === 'idle' && typeof env.scheduleIdle === 'function') return env.scheduleIdle;
    if (typeof env.schedule === 'function') return env.schedule;
    return null;
  }

  function usesAsyncSchedule(kind) {
    const fn = scheduler(kind);
    if (typeof fn !== 'function') return false;
    if (scheduleMode === 'async') return true;
    if (scheduleMode === 'sync') return false;
    let ran = false;
    fn(() => {
      ran = true;
    });
    scheduleMode = ran ? 'sync' : 'async';
    return scheduleMode === 'async';
  }

  function arm(kind, callback) {
    const fn = scheduler(kind);
    if (!usesAsyncSchedule(kind) || typeof fn !== 'function') return false;
    scheduled = true;
    scheduledKind = kind;
    const handle = fn(() => {
      scheduled = false;
      idleHandle = null;
      callback();
    });
    if (kind === 'idle') idleHandle = handle;
    return true;
  }

  function yieldToHost(continuation) {
    return arm(preferSoon ? 'soon' : 'idle', continuation);
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

  // The first document walk stays on requestIdleCallback. Small mutation batches
  // are translated in the observer, before paint. Larger batches use setTimeout(0).
  // Editors are still skipped, so a synchronous pass cannot answer ProseMirror.
  function schedulePump(kind) {
    if (killed) return;
    if (kind === 'soon') preferSoon = true;
    if (pumping) return;
    if (scheduled && preferSoon && scheduledKind === 'idle') {
      if (idleHandle != null && typeof env.cancelIdle === 'function') {
        try {
          env.cancelIdle(idleHandle);
        } catch {
          // The idle handle may already have fired.
        }
      }
      scheduled = false;
      idleHandle = null;
    } else if (scheduled) {
      return;
    }
    const useKind = preferSoon ? 'soon' : (kind || 'idle');
    if (!arm(useKind, () => {
      if (!killed && queue.length) pump();
    })) pump();
  }

  // Process only the items pushed after floor. Leave an idle document walk queued.
  function drainNewWork(floor) {
    const start = now();
    let steps = 0;
    while (queue.length > floor) {
      if (killed) return true;
      const t = now();
      if (steps >= SYNC_NODE_LIMIT || t - start >= SYNC_MS) {
        charge(t - start);
        return false;
      }
      if (budgetMs <= 0 || burstSteps > BURST_STEP_CAP || spent + (t - start) > budgetMs) {
        charge(t - start);
        kill();
        return true;
      }
      steps += 1;
      burstSteps += 1;
      burst += 1;
      const item = queue.pop();
      try {
        visit(item);
      } catch {
        // One bad node must not wedge the observer.
      }
    }
    charge(now() - start);
    if (!queue.length) burstSteps = 0;
    return true;
  }

  function flushMutations(floor) {
    if (killed || pumping || draining) return;
    draining = true;
    let done = false;
    try {
      done = drainNewWork(floor);
    } finally {
      draining = false;
    }
    if (!done && !killed) followUpDrain();
  }

  // A dropdown paints before setTimeout(0). A few microtasks finish the label first.
  function followUpDrain() {
    const micro = typeof env.queueMicrotask === 'function' ? env.queueMicrotask : null;
    if (!micro) {
      schedulePump('soon');
      return;
    }
    let slices = 0;
    const step = () => {
      if (killed || pumping || draining || !queue.length) return;
      draining = true;
      let finished = false;
      try {
        finished = drainNewWork(0);
      } finally {
        draining = false;
      }
      if (finished || killed || !queue.length) return;
      slices += 1;
      if (slices < 3) micro(step);
      else schedulePump('soon');
    };
    micro(step);
  }

  observer = new MutationObserver((records) => {
    if (killed) return;
    const floor = queue.length;
    let added = false;
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
      added = true;
    }
    if (added) flushMutations(floor);
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
        const floor = queue.length;
        enqueue(shadow);
        flushMutations(floor);
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

  function selectorOf(el) {
    const tag = String(el.tagName || 'node').toLowerCase();
    const testid = el.getAttribute?.('data-testid');
    if (testid) return `${tag}[data-testid="${String(testid).slice(0, 48)}"]`;
    const kind = el.getAttribute?.('data-message-kind');
    if (kind) return `${tag}[data-message-kind="${kind}"]`;
    const id = el.getAttribute?.('id');
    if (id) return `${tag}#${String(id).slice(0, 40)}`;
    const raw = typeof el.className === 'string' ? el.className.trim() : '';
    const fromName = raw ? raw.split(/\s+/).slice(0, 2) : [];
    const cls = (fromName.length ? fromName : classTokens(el).slice(0, 2)).join('.');
    return cls ? `${tag}.${cls}` : tag;
  }

  function ancestorPath(el) {
    const parts = [];
    let cur = el;
    for (let i = 0; i < 6 && cur && cur.nodeType === 1; i += 1) {
      parts.push(selectorOf(cur));
      cur = cur.parentElement || null;
    }
    return parts.reverse().join(' > ');
  }

  function mostlyEnglish(text) {
    const core = normalized(text);
    if (!core) return false;
    const letters = core.match(/[A-Za-z]/g);
    if (!letters || letters.length < 2) return false;
    const cjk = core.match(/[\u4e00-\u9fff]/g);
    return letters.length > (cjk ? cjk.length : 0);
  }

  function explainEnglish(text, skipped, latched, visited) {
    if (skipped) return { reason: 'skipped', detail: skipped };
    if (killed) return { reason: 'budget', detail: 'translator stopped' };
    if (latched) return { reason: 'latched', detail: 'write cooldown' };
    let result = null;
    try {
      result = translateText(text, dictionary);
    } catch {
      result = null;
    }
    if (result && result.changed) {
      return { reason: 'budget', detail: visited ? 'visited but still English' : 'not yet applied' };
    }
    return { reason: 'no dictionary match', detail: visited ? 'visited' : 'not yet applied' };
  }

  function pushReport(entries, entry) {
    if (entries.length >= REPORT_LIMIT) return;
    entries.push(entry);
  }

  function styleHidden(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.getAttribute?.('hidden') != null) return true;
    const style = el.style;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
    if (typeof getComputedStyle === 'function') {
      try {
        const computed = getComputedStyle(el);
        if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) return true;
      } catch {
        // A detached node may refuse computed style.
      }
    }
    return false;
  }

  function boxHidden(el) {
    if (!el || el.nodeType !== 1 || typeof el.getBoundingClientRect !== 'function') return false;
    const box = el.getBoundingClientRect();
    return Boolean(box && box.width === 0 && box.height === 0);
  }

  function coveredByPlaceholderCss(text) {
    const sources = dictionary && dictionary.placeholders;
    if (!sources || !sources.length) return false;
    const core = normalized(text);
    for (let i = 0; i < sources.length; i += 1) {
      if (normalized(sources[i]) !== core) continue;
      let result = null;
      try {
        result = translateText(core, dictionary);
      } catch {
        return false;
      }
      return Boolean(result && result.changed && result.text !== core);
    }
    return false;
  }

  function pushReportChildren(stack, node) {
    if (node.shadowRoot) stack.push(node.shadowRoot);
    const children = node.childNodes || [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }

  function report(options) {
    const visibleOnly = Boolean(options && options.visibleOnly);
    const entries = [];
    const root = document.documentElement || document.body;
    const stack = root ? [root] : [];
    let seen = 0;
    while (stack.length && entries.length < REPORT_LIMIT && seen < REPORT_NODE_CAP) {
      const node = stack.pop();
      if (!node) continue;
      seen += 1;
      if (node.nodeType === 11) {
        const children = node.childNodes || [];
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
        continue;
      }
      if (node.nodeType === 3) {
        const value = node.nodeValue || '';
        if (!mostlyEnglish(value)) continue;
        const parent = node.parentElement;
        if (visibleOnly && parent && (styleHidden(parent) || boxHidden(parent))) continue;
        const skipped = parent ? skipReason(parent) : 'skipped';
        const why = explainEnglish(value, skipped, cooled(node), textMemo.has(node));
        pushReport(entries, {
          kind: 'text',
          text: normalized(value).slice(0, 240),
          path: parent ? ancestorPath(parent) : '',
          reason: why.reason,
          detail: why.detail,
        });
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = String(node.tagName || '').toUpperCase();
      if (tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      if (visibleOnly && styleHidden(node)) continue;
      // A zero-size portal wrapper can hold a visible menu. Keep walking.
      const zero = visibleOnly && boxHidden(node);
      if (!zero) {
        for (let i = 0; i < TRANSLATABLE_ATTRS.length; i += 1) {
          const name = TRANSLATABLE_ATTRS[i];
          const value = node.getAttribute?.(name);
          if (!value || !mostlyEnglish(value)) continue;
          if (placeholderAttr(name) && coveredByPlaceholderCss(value)) continue;
          const skipped = shouldSkipAttributeTarget(node) ? (skipReason(node) || 'attribute target') : null;
          const why = explainEnglish(value, skipped, attributeCooling(node), attrLoops.has(node));
          pushReport(entries, {
            kind: name,
            text: normalized(value).slice(0, 240),
            path: ancestorPath(node),
            reason: why.reason,
            detail: why.detail,
          });
        }
      }
      pushReportChildren(stack, node);
    }
    return {
      version: version || '0.1.0',
      killed,
      count: entries.length,
      truncated: entries.length >= REPORT_LIMIT || (seen >= REPORT_NODE_CAP && stack.length > 0),
      entries,
    };
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
  host.__cursorZhHans.report = report;
  installPlaceholderStyle();

  const target = document.documentElement || document.body;
  if (target) observe(target);
  if (document.body) enqueue(document.body);
  // Context views and portals can be siblings of body, or already inside a shadow root.
  const rootEl = document.documentElement;
  if (rootEl && rootEl !== document.body) {
    const kids = rootEl.childNodes || [];
    for (let i = kids.length - 1; i >= 0; i -= 1) {
      const kid = kids[i];
      if (kid === document.body || kid === document.head) continue;
      const tag = String(kid.tagName || '').toUpperCase();
      if (tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE') continue;
      enqueue(kid);
    }
  }
  if (queue.length) schedulePump('idle');

  return {
    already: false,
    observer,
    disconnect,
  };
}
