/**
 * Pure translation engine shared by the CLI tests and the injected runtime.
 * No DOM and no Node APIs, so it can be copied into the workbench page.
 */

export const MAX_TEXT_LENGTH = 2000;
export const MAX_CORE_LENGTH = 500;

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'CANVAS',
  'CODE',
  'PRE',
]);

const SKIP_CLASSES = new Set([
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
  'composer-messages-container',
  'human-message-inline-body',
  'markdown-root',
  'markdown-lexical-editor-content-editable',
  'markdown-lexical-editor-code',
  'markdown-lexical-editor-code-block',
  'agent-transcript-row-markdown',
  'ai-input-full-input-box',
  'composer-questionnaire-toolbar-freeform-input',
  'monaco-inputbox',
  'inputarea',
  'agent-sidebar-cell-rename-input',
  'agent-tab-rename-input',
]);

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
    });
  }

  return { exact, fragments, regex };
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

  if (dictionary.exact.has(core)) {
    const text = lead + dictionary.exact.get(core) + tail;
    return { text, changed: text !== input, tier: 'exact' };
  }

  for (const entry of dictionary.regex) {
    entry.re.lastIndex = 0;
    if (!entry.re.test(core)) continue;
    entry.re.lastIndex = 0;
    const text = lead + core.replace(entry.re, entry.replacement) + tail;
    return { text, changed: text !== input, tier: 'regex' };
  }

  for (const frag of dictionary.fragments) {
    if (frag.from !== core) continue;
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

export function elementMatchesSkip(el) {
  if (!el || el.nodeType === 3) return false;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag && SKIP_TAGS.has(tag)) return true;
  if (el.isContentEditable) return true;
  const editable = el.getAttribute?.('contenteditable');
  if (editable != null && editable !== 'false') return true;
  if (el.getAttribute?.('data-cursor-zh-skip') != null) return true;
  for (const name of SKIP_CLASSES) {
    if (hasClass(el, name)) return true;
  }
  return false;
}

export function shouldSkipElement(el) {
  let cur = el;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur.nodeType === 3) {
      cur = cur.parentElement || null;
      continue;
    }
    if (elementMatchesSkip(cur)) return true;
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
