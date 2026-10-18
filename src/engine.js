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
  'ProseMirror',
  'tiptap',
]);

const PROTECTED_MESSAGE_KINDS = new Set(['assistant', 'human']);

const MATCH_SPACES = /[\u00a0\u202f\u2007\u2009\u200a\ufeff]/g;
const ZERO_WIDTH = /[\u200b\u200c\u200d\ufeff]/g;

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

function symbolizeModifiers(text, compact) {
  let out = text
    .replace(/\bCtrl\b/g, '⌘')
    .replace(/\bAlt\b/g, '⌥')
    .replace(/\bShift\b/g, '⇧');
  if (compact) out = out.replace(/([⌘⌥⇧])\s*\+\s*/g, '$1');
  return out;
}

// macOS draws Ctrl/Alt/Shift as ⌘/⌥/⇧, sometimes without the plus.
function addPlatformModifierKeys(exact) {
  const extras = [];
  for (const [from, to] of exact) {
    if (!/\b(Ctrl|Alt|Shift)\b/.test(from)) continue;
    const pairs = [
      [symbolizeModifiers(from, false), symbolizeModifiers(to, false)],
      [symbolizeModifiers(from, true), symbolizeModifiers(to, true)],
    ];
    for (const [key, value] of pairs) {
      if (!key || key === from || exact.has(key)) continue;
      extras.push([key, value]);
    }
  }
  for (const [key, value] of extras) {
    if (!exact.has(key) && key !== value) exact.set(key, value);
  }
}

function projectModifiers(source, translated) {
  let out = translated;
  if (source.includes('⌘')) out = out.replace(/\bCtrl\b/g, '⌘');
  if (source.includes('⌥')) out = out.replace(/\bAlt\b/g, '⌥');
  if (source.includes('⇧')) out = out.replace(/\bShift\b/g, '⇧');
  if (/[⌘⌥⇧][A-Za-z]/.test(source)) out = out.replace(/([⌘⌥⇧])\s*\+\s*/g, '$1');
  return out;
}

function canonicalizeModifiers(text) {
  return text
    .replace(/⌘/g, 'Ctrl')
    .replace(/⌥/g, 'Alt')
    .replace(/⇧/g, 'Shift')
    .replace(/⌃/g, 'Ctrl');
}

function lookupExact(dictionary, core) {
  if (dictionary.exact.has(core)) return dictionary.exact.get(core);
  const canonical = canonicalizeModifiers(core);
  if (canonical === core || !dictionary.exact.has(canonical)) return null;
  return projectModifiers(core, dictionary.exact.get(canonical));
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
  addPlatformModifierKeys(exact);

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
      open: patternIsOpen(item.pattern),
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

  const placeholders = [];
  const seenPlaceholders = new Set();
  const placeholderSource = Array.isArray(raw.placeholders) ? raw.placeholders : [];
  for (const item of placeholderSource) {
    if (typeof item !== 'string' || item.length === 0 || seenPlaceholders.has(item)) continue;
    seenPlaceholders.add(item);
    placeholders.push(item);
  }

  return { exact, fragments, regex, regexBuckets, placeholders };
}

function patternIsOpen(pattern) {
  let cls = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '[') {
      cls = true;
      continue;
    }
    if (ch === ']' && cls) {
      cls = false;
      continue;
    }
    // A dot inside a character class is not a wildcard.
    if (!cls && ch === '.') return true;
  }
  return false;
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

const MONTH_INDEX = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const FULL_DATE = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})(?:,\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?\b/gi;

// "Oct 17, 2026, 10:15 PM" → "2026年10月17日 22:15". Month and day stay unpadded.
export function localizeEmbeddedDates(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(FULL_DATE, (all, month, day, year, hour, minute, second, ampm) => {
    const m = MONTH_INDEX[String(month).toLowerCase()];
    if (!m) return all;
    let out = `${year}年${m}月${Number(day)}日`;
    if (hour != null && minute != null) {
      let h = Number(hour);
      const ap = ampm ? String(ampm).toUpperCase() : '';
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      out += ` ${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      if (second != null) out += `:${String(second).padStart(2, '0')}`;
    }
    return out;
  });
}

export function localizeArrowKeys(text) {
  if (typeof text !== 'string' || !/[\u4e00-\u9fff]/.test(text)) return text;
  return text
    .replace(/RightArrow/g, '→')
    .replace(/LeftArrow/g, '←')
    .replace(/UpArrow/g, '↑')
    .replace(/DownArrow/g, '↓');
}

function polishTranslated(text) {
  return localizeEmbeddedDates(localizeArrowKeys(text));
}

function packResult(text, input, tier, open) {
  const polished = polishTranslated(text);
  const result = { text: polished, changed: polished !== input, tier };
  if (open) result.open = true;
  return result;
}

export function translateText(input, dictionary) {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_TEXT_LENGTH) {
    return { text: input, changed: false, tier: null };
  }
  // Zero-width characters sit on labels such as "High Fast". They are not part of the key.
  const source = input.replace(ZERO_WIDTH, '');
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(source);
  const lead = match[1];
  const core = match[2];
  const tail = match[3];
  if (!core || core.length > MAX_CORE_LENGTH) {
    return { text: input, changed: false, tier: null };
  }
  const normalizedCore = core.replace(MATCH_SPACES, ' ');

  const exactHit = lookupExact(dictionary, normalizedCore);
  if (exactHit) {
    return packResult(lead + exactHit + tail, input, 'exact');
  }

  const candidates = regexCandidates(normalizedCore, dictionary);
  for (let i = 0; i < candidates.length; i += 1) {
    const entry = candidates[i];
    entry.re.lastIndex = 0;
    if (!entry.re.test(normalizedCore)) continue;
    entry.re.lastIndex = 0;
    const text = lead + normalizedCore.replace(entry.re, entry.replacement) + tail;
    return packResult(text, input, 'regex', entry.open);
  }

  for (const frag of dictionary.fragments) {
    if (frag.from !== normalizedCore) continue;
    return packResult(lead + frag.to + tail, input, 'fragment');
  }

  const dated = localizeEmbeddedDates(input);
  if (dated !== input) return { text: dated, changed: true, tier: 'regex' };
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

const MODEL_PICKER_LABEL_CLASSES = [
  'vscode-model-picker__trigger-markdown',
  'vscode-model-picker__trigger-text',
  'vscode-model-picker__trigger-variant-suffix',
  'vscode-model-picker__trigger',
  'ui-model-picker__item-content-name',
  'ui-model-picker__item-content',
  'ui-model-picker__menu',
  'ui-model-picker__trigger',
];

function isModelPickerLabel(el) {
  for (let i = 0; i < MODEL_PICKER_LABEL_CLASSES.length; i += 1) {
    if (hasClass(el, MODEL_PICKER_LABEL_CLASSES[i])) return true;
  }
  const raw = typeof el.className === 'string' ? el.className : '';
  return /(?:^|\s)[\w-]*model-picker[\w-]*(?:\s|$)/i.test(raw);
}

// Hover cards are portaled out of the picker, so the markdown is not a label child.
// Live cards use ui-preview-card-layer / ui-menu__tooltip, not role=tooltip.
function isModelTooltip(el) {
  if (!el || el.nodeType === 3) return false;
  if (el.getAttribute?.('role') === 'tooltip') return true;
  if (el.getAttribute?.('data-component') === 'tooltip-popup') return true;
  return hasClass(el, 'ui-menu__tooltip') || hasClass(el, 'ui-preview-card-layer');
}

// Buttons and chips inside a human or assistant bubble are chrome.
// The typed message stays skipped; the controls around it do not.
function isMessageChrome(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = tagNameOf(el);
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SELECT' || tag === 'SUMMARY') return true;
  const role = el.getAttribute?.('role');
  if (role === 'button' || role === 'menuitem' || role === 'tab' || role === 'option' || role === 'switch') {
    return true;
  }
  if (hasClass(el, 'ui-button') || hasClass(el, 'ui-icon-button')
    || hasClass(el, 'ui-prompt-input-toolbar') || hasClass(el, 'ui-prompt-input-submit-button')
    || hasClass(el, 'vscode-model-picker__trigger') || hasClass(el, 'vscode-model-picker__trigger-text')
    || hasClass(el, 'vscode-model-picker__trigger-markdown')) return true;
  return isModelPickerLabel(el);
}

function chromeInsideMessage(origin, boundary) {
  let cur = origin;
  const seen = new Set();
  while (cur && cur !== boundary && !seen.has(cur)) {
    seen.add(cur);
    if (cur.nodeType !== 3 && isMessageChrome(cur)) return true;
    if (cur.parentElement) {
      cur = cur.parentElement;
      continue;
    }
    const root = cur.getRootNode?.();
    cur = root && root.host ? root.host : null;
  }
  return false;
}

function markdownInModelPicker(node) {
  return hasClass(node, 'markdown-root') && walkAncestors(node, (el) => isModelPickerLabel(el) || isModelTooltip(el));
}

export function shouldSkipElement(el) {
  return walkAncestors(el, (node) => {
    if (isEditableControl(node)) return true;
    if (!isProtectedSurface(node)) return false;
    // Model names and the Auto row are markdown. That is a label, not a chat message.
    if (markdownInModelPicker(node)) return false;
    const kind = node.getAttribute?.('data-message-kind');
    if (kind && PROTECTED_MESSAGE_KINDS.has(String(kind)) && chromeInsideMessage(el, node)) return false;
    return true;
  });
}

function surfaceReason(el) {
  const tag = tagNameOf(el);
  if (tag && PROTECTED_TAGS.has(tag)) return `tag:${tag}`;
  if (el.getAttribute?.('data-cursor-zh-skip') != null) return 'attr:data-cursor-zh-skip';
  const kind = el.getAttribute?.('data-message-kind');
  if (kind && PROTECTED_MESSAGE_KINDS.has(String(kind))) return `message-kind:${kind}`;
  for (const name of PROTECTED_CLASSES) {
    if (hasClass(el, name)) return `class:${name}`;
  }
  if (tag && EDITABLE_TAGS.has(tag)) return `tag:${tag}`;
  if (el.isContentEditable) return 'editable:contenteditable';
  const editable = el.getAttribute?.('contenteditable');
  if (editable != null && editable !== 'false') return 'editable:contenteditable';
  for (const name of EDITABLE_CLASSES) {
    if (hasClass(el, name)) return `class:${name}`;
  }
  return null;
}

// Why this node is left alone. Null means the translator may rewrite it.
export function skipReason(el) {
  let cur = el;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur.nodeType === 3) {
      cur = cur.parentElement || null;
      continue;
    }
    const reason = surfaceReason(cur);
    if (reason) {
      if (reason === 'class:markdown-root' && markdownInModelPicker(cur)) {
        cur = cur.parentElement || null;
        continue;
      }
      if (reason.startsWith('message-kind:') && chromeInsideMessage(el, cur)) {
        cur = cur.parentElement || null;
        continue;
      }
      return reason;
    }
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
  return null;
}

export function shouldSkipAttributeTarget(el) {
  return walkAncestors(el, (node) => {
    if (!elementMatchesSkip(node)) return false;
    // A native field's own placeholder is not rebuilt when the attribute changes.
    // Anything inside a contenteditable, ProseMirror, or tiptap editor is.
    const tag = tagNameOf(node);
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && node === el) return false;
    const kind = node.getAttribute?.('data-message-kind');
    if (kind && PROTECTED_MESSAGE_KINDS.has(String(kind)) && chromeInsideMessage(el, node)) return false;
    return true;
  });
}

function cssQuoted(value) {
  return `"${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\A ')
    .replace(/</g, '\\3C ')}"`;
}

export function buildPlaceholderCss(dictionary) {
  const sources = dictionary && Array.isArray(dictionary.placeholders) ? dictionary.placeholders : [];
  const rules = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const result = translateText(source, dictionary);
    if (!result.changed || result.text === source) continue;
    const attr = cssQuoted(source);
    const content = cssQuoted(result.text);
    const empty = `.ProseMirror p.is-editor-empty[data-placeholder=${attr}]::before,.tiptap p.is-editor-empty[data-placeholder=${attr}]::before`;
    const mention = `.ProseMirror p.is-editor-mention-only[data-placeholder=${attr}]::after,.tiptap p.is-editor-mention-only[data-placeholder=${attr}]::after`;
    rules.push(`${empty}{content:${content} !important}`);
    rules.push(`${mention}{content:${content} !important}`);
  }
  return rules.join('\n');
}
