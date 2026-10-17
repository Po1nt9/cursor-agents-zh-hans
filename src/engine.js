/**
 * Pure translation engine shared by the CLI tests and the injected runtime.
 * No DOM and no Node APIs, so it can be copied into the workbench page.
 */

export const MAX_TEXT_LENGTH = 2000;
export const MAX_CORE_LENGTH = 500;

const PROTECTED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CANVAS',
  'CODE',
  'PRE',
]);

const EDITABLE_TAGS = new Set([
  'TEXTAREA',
  'INPUT',
]);

const PROTECTED_CLASSES = new Set([
  'monaco-editor',
  'monaco-diff-editor',
  'monaco-mouse-cursor-text',
  'view-lines',
  'view-line',
  'xterm',
  'xterm-screen',
  'xterm-helper-textarea',
  'terminal-wrapper',
  'diff-line',
  'diff-line-content',
  'diff-lines',
  'diff-content',
  'diff-hidden-lines-text',
  'composer-message-markdown',
  'composer-human-message',
  'composer-human-message-content',
  'composer-message-codeblock',
  'human-message-inline-body',
  'markdown-root',
  'markdown-lexical-editor-code',
  'markdown-lexical-editor-code-block',
  'agent-transcript-row-markdown',
  'ui-kbd',
  'monaco-keybinding',
  'keybinding-key',
  'keybinding-label',
]);

const EDITABLE_CLASSES = new Set([
  'markdown-lexical-editor-content-editable',
  'ai-input-full-input-box',
  'composer-questionnaire-toolbar-freeform-input',
  'monaco-inputbox',
  'inputarea',
  'agent-sidebar-cell-rename-input',
  'agent-tab-rename-input',
]);

const PROTECTED_MESSAGE_KINDS = new Set(['assistant', 'human']);

const MATCH_SPACES = /[\u00a0\u202f\u2007\u2009\u200a\ufeff]/g;

export function isSafeFragment(text) {
  if (typeof text !== 'string') return false;
  if (text.length < 8 || !text.includes(' ')) return false;
  if (/[{}$\\<>]/.test(text)) return false;
  return true;
}

function assertTranslation(from, to, where) {
  if (typeof from !== 'string' || typeof to !== 'string' || from.length === 0 || to.length === 0) {
    throw new Error(`${where} 需要非空的原文和译文`);
  }
  if (from === '__proto__' || from === 'prototype' || from === 'constructor') {
    throw new Error(`${where} 包含不允许的键`);
  }
}

export function compileDictionary(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('词典格式无效');
  }
  const exact = new Map();
  const exactSource = raw.exact || {};
  for (const from of Object.keys(exactSource)) {
    const to = exactSource[from];
    assertTranslation(from, to, `exact[${from}]`);
    if (from !== to) exact.set(from, to);
  }

  const fragMap = new Map();
  const explicit = Array.isArray(raw.fragments) ? raw.fragments : [];
  for (const item of explicit) {
    if (!item || typeof item !== 'object') {
      throw new Error('fragments 中有无效条目');
    }
    assertTranslation(item.from, item.to, `fragment ${item.from}`);
    if (!isSafeFragment(item.from)) {
      throw new Error(`片段过短或含糊，已拒绝: ${item.from}`);
    }
    fragMap.set(item.from, item.to);
  }
  const fragments = [...fragMap.entries()]
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from));

  const regex = [];
  const regexSource = Array.isArray(raw.regex) ? raw.regex : [];
  for (const item of regexSource) {
    if (!item || typeof item.pattern !== 'string' || typeof item.replacement !== 'string') {
      throw new Error('regex 条目缺少 pattern 或 replacement');
    }
    if (!item.pattern.startsWith('^') || !item.pattern.endsWith('$')) {
      throw new Error(`正则必须整句锚定 (^...$): ${item.id || item.pattern}`);
    }
    const flags = item.flags || '';
    if (/[g]/.test(flags)) {
      throw new Error(`正则不允许 g 标志: ${item.id || item.pattern}`);
    }
    let re;
    try {
      re = new RegExp(item.pattern, flags);
    } catch (error) {
      throw new Error(`无法编译正则 ${item.id || item.pattern}: ${error.message}`);
    }
    regex.push({
      id: item.id || item.pattern,
      pattern: item.pattern,
      flags,
      replacement: item.replacement,
      re,
      index: regex.length,
      route: regexRoute(item.pattern),
    });
  }

  const regexBuckets = new Map();
  for (const entry of regex) {
    let list = regexBuckets.get(entry.route);
    if (!list) {
      list = [];
      regexBuckets.set(entry.route, list);
    }
    list.push(entry);
  }

  return { exact, fragments, regex, regexBuckets };
}

function regexRoute(pattern) {
  if (pattern.startsWith('^(\\d') || pattern.startsWith('^\\d')) return 'digit';
  let i = 1;
  let prefix = '';
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next === 'd' || next === 'w' || next === 's' || next === 'D' || next === 'W' || next === 'S') break;
      if (next === '(' || next === ')' || next === '.' || next === '$' || next === '^' || next === '\\') {
        prefix += next;
        i += 2;
        continue;
      }
      break;
    }
    if (ch === '(' || ch === '.' || ch === '[' || ch === '|' || ch === '+' || ch === '*' || ch === '?' || ch === '$') break;
    prefix += ch;
    i += 1;
  }
  return prefix ? prefix[0] : 'any';
}

function regexCandidates(core, dictionary) {
  const buckets = dictionary.regexBuckets;
  if (!buckets) return dictionary.regex;
  const first = core[0];
  const parts = [];
  if (first >= '0' && first <= '9') {
    const digit = buckets.get('digit');
    if (digit) parts.push(digit);
  }
  const keyed = first ? buckets.get(first) : null;
  if (keyed) parts.push(keyed);
  const any = buckets.get('any');
  if (any) parts.push(any);
  if (parts.length === 0) return [];
  if (parts.length === 1) return parts[0];
  return parts.flat().sort((a, b) => a.index - b.index);
}

function isWordChar(ch) {
  return Boolean(ch) && /[A-Za-z0-9_]/.test(ch);
}

function startsWithBounded(text, index, phrase) {
  if (!text.startsWith(phrase, index)) return false;
  const before = index > 0 ? text[index - 1] : '';
  const after = text[index + phrase.length] || '';
  return !isWordChar(before) && !isWordChar(after);
}

export function applyFragments(text, fragments) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = null;
    for (const frag of fragments) {
      if (frag.from.length > text.length - i) continue;
      if (startsWithBounded(text, i, frag.from)) {
        matched = frag;
        break;
      }
    }
    if (matched) {
      out += matched.to;
      i += matched.from.length;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

export function translateText(input, dictionary) {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_TEXT_LENGTH) {
    return { text: input, changed: false, tier: null };
  }
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(input);
  const lead = match[1];
  const core = match[2];
  const tail = match[3];
  if (!core || core.length > MAX_CORE_LENGTH) {
    return { text: input, changed: false, tier: null };
  }
  const normalizedCore = core.replace(MATCH_SPACES, ' ');

  if (dictionary.exact.has(normalizedCore)) {
    const text = lead + dictionary.exact.get(normalizedCore) + tail;
    return { text, changed: text !== input, tier: 'exact' };
  }

  const candidates = regexCandidates(normalizedCore, dictionary);
  for (let i = 0; i < candidates.length; i += 1) {
    const entry = candidates[i];
    entry.re.lastIndex = 0;
    if (!entry.re.test(normalizedCore)) continue;
    entry.re.lastIndex = 0;
    const text = lead + normalizedCore.replace(entry.re, entry.replacement) + tail;
    return { text, changed: text !== input, tier: 'regex' };
  }

  for (const frag of dictionary.fragments) {
    if (frag.from !== normalizedCore) continue;
    const text = lead + frag.to + tail;
    return { text, changed: text !== input, tier: 'fragment' };
  }

  return { text: input, changed: false, tier: null };
}

function hasClass(el, name) {
  if (el.classList && typeof el.classList.contains === 'function') {
    return el.classList.contains(name);
  }
  const raw = typeof el.className === 'string' ? el.className : '';
  return raw.split(/\s+/).includes(name);
}

function tagNameOf(el) {
  return typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
}

export function isProtectedSurface(el) {
  if (!el || el.nodeType === 3) return false;
  const tag = tagNameOf(el);
  if (tag && PROTECTED_TAGS.has(tag)) return true;
  if (el.getAttribute?.('data-cursor-zh-skip') != null) return true;
  const kind = el.getAttribute?.('data-message-kind');
  if (kind && PROTECTED_MESSAGE_KINDS.has(String(kind))) return true;
  for (const name of PROTECTED_CLASSES) {
    if (hasClass(el, name)) return true;
  }
  return false;
}

export function isEditableControl(el) {
  if (!el || el.nodeType === 3) return false;
  const tag = tagNameOf(el);
  if (tag && EDITABLE_TAGS.has(tag)) return true;
  if (el.isContentEditable) return true;
  const editable = el.getAttribute?.('contenteditable');
  if (editable != null && editable !== 'false') return true;
  for (const name of EDITABLE_CLASSES) {
    if (hasClass(el, name)) return true;
  }
  return false;
}

export function elementMatchesSkip(el) {
  return isProtectedSurface(el) || isEditableControl(el);
}

function walkAncestors(el, predicate) {
  let cur = el;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur.nodeType === 3) {
      cur = cur.parentElement || null;
      continue;
    }
    if (predicate(cur)) return true;
    if (cur.parentElement) {
      cur = cur.parentElement;
      continue;
    }
    const root = cur.getRootNode?.();
    if (root && root.host) {
      cur = root.host;
      continue;
    }
    break;
  }
  return false;
}

export function shouldSkipElement(el) {
  return walkAncestors(el, (node) => isProtectedSurface(node) || isEditableControl(node));
}

export function shouldSkipAttributeTarget(el) {
  return walkAncestors(el, isProtectedSurface);
}
