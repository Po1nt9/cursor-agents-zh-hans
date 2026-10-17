/**
 * Coverage audit for user-visible UI strings.
 * Counts and categories only. Callers must not persist bundle source.
 */

export const COVERAGE_AREAS = [
  ['home-composer', 'Agents window home / composer'],
  ['agent-list', 'Agent list / sidebar'],
  ['conversation', 'Conversation chrome / tool chips / status'],
  ['review-diff', 'Review / changes / diff chrome'],
  ['panes', 'Browser / terminal / desktop panes'],
  ['settings-general', 'Settings · General'],
  ['settings-profile', 'Settings · Profile'],
  ['settings-appearance', 'Settings · Appearance'],
  ['settings-plan', 'Settings · Plan & Usage'],
  ['settings-agents', 'Settings · Agents'],
  ['settings-models', 'Settings · Models'],
  ['settings-voice', 'Settings · Voice'],
  ['settings-scm', 'Settings · Source Control'],
  ['settings-browser', 'Settings · Browser & Network'],
  ['settings-indexing', 'Settings · Code Intelligence'],
  ['settings-beta', 'Settings · Beta'],
  ['settings-other', 'Settings · other'],
  ['customize', 'Customize (Plugins / MCP / Skills / Rules / Hooks)'],
  ['automations', 'Automations'],
  ['projects', 'Projects'],
  ['onboarding', 'Onboarding / Getting Started'],
  ['dialogs', 'Dialogs / toasts'],
  ['command-palette', 'Command palette (Cursor / Agents)'],
  ['inherited-editor', 'Inherited editor / VS Code commands'],
  ['other', 'Other Glass UI'],
];

const AREA_INDEX = new Map(COVERAGE_AREAS.map(([id], index) => [id, index]));

const PROP_PATTERN = /\b(label|title|placeholder|description|tooltip|ariaLabel|subtitle|heading|hint|buttonText|actionLabel|runningLabel|doneLabel|failedLabel|confirmLabel|cancelLabel|header|detail|emptyMessage|primaryLabel|secondaryLabel|statusLabel|children|message|loading|completed|error)\s*:\s*"|children\s*:\s*\[\s*"|xt\(\d+\s*,\s*"|title\s*:\s*\{\s*value\s*:\s*"/g;

const MODULE_PATTERN = /"([^"]+\.js)"\(\)/g;

export function isUserVisibleText(text) {
  if (typeof text !== 'string') return false;
  const value = text.trim();
  if (value.length < 2 || value.length > 180) return false;
  if (!/^[A-Za-z]/.test(value)) return false;
  if (!/[a-z]/.test(value)) return false;
  if (/https?:|www\.|\bcursor\.com\/|[{}<>\\]|\$\{|=>|\.js\b|\.css\b|\.png\b|\.svg\b/i.test(value)) return false;
  if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(value)) return false;
  if (/^[a-z0-9_.-]+$/.test(value)) return false;
  if (/^[A-Z0-9_]+$/.test(value)) return false;
  if ((value.match(/-/g) || []).length >= 2 && !value.includes(' ')) return false;
  if (/^(glass-|ui-|vscode-)/.test(value)) return false;
  const letters = value.match(/[A-Za-z]/g);
  if (!letters || letters.length / value.length < 0.5) return false;
  if (!value.includes(' ')) {
    if (!/^[A-Z][a-z0-9]{1,}$/.test(value) && !/^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(value)) {
      return false;
    }
  }
  if (/\b(stack trace|EINVAL|EACCES|TypeError|undefined is not|TODO|FIXME)\b/.test(value)) return false;
  if (/^(Duration|Number|Count|Histogram|Latency) of /i.test(value)) return false;
  if (/\b(milliseconds|microseconds|histogram)\b/i.test(value)) return false;
  if (/\(For Testing\)|\(Dev-only\)|\bDev-only\b/.test(value)) return false;
  if (/^Action \d+$/.test(value)) return false;
  if (/measurement was rejected|CachedBlobStore|Disposable Tracking|leak detection/i.test(value)) return false;
  return true;
}

export function isCursorDesktopModule(name) {
  const file = String(name || '');
  if (/userAgent|textModel|viewModel|editorModel|diffEditor|completionModel|suggestModel|outlineModel|referencesModel|explorerModel|notebookEditor/i.test(file)) {
    return false;
  }
  return /cursor|composer|glass|mcp|automation|bugbot|cloudAgent|cloud-agent|background-composer|backgroundComposer|aiSettings|aiChat|aichat|agentSettings|agents/i.test(file);
}

function isInheritedEditorModule(file) {
  return /^(editor|monaco|diffEditor|codeAction|keybinding|snippet|hover|suggest|rename|format|folding|goto|outline|marker|debug|scm|extensions|notebook|xterm)/i.test(file)
    || /CodeAction|EditorWidget|Keybinding|Snippet|GotoLine|QuickOpen|Markers|DebugView|ExtensionEditor|FindWidget/.test(file);
}

function settingsSectionFromContext(before) {
  const tail = String(before || '').slice(-220);
  const match = tail.match(/Tu\(\s*"(general|profile|appearance|plan-usage|indexing|chat|voice|models|git-prs|browser|beta|developer)"/);
  if (!match) return null;
  const map = {
    general: 'settings-general',
    profile: 'settings-profile',
    appearance: 'settings-appearance',
    'plan-usage': 'settings-plan',
    indexing: 'settings-indexing',
    chat: 'settings-agents',
    voice: 'settings-voice',
    models: 'settings-models',
    'git-prs': 'settings-scm',
    browser: 'settings-browser',
    beta: 'settings-beta',
    developer: 'settings-other',
  };
  return map[match[1]] || 'settings-other';
}

export function classifyArea(moduleName, text, prop, bundle, before = '') {
  const file = String(moduleName || '');
  const folded = file.toLowerCase();
  if (/\.stylex\.js$|_pb\.js$|\.test\.js$|\.spec\.js$/.test(folded)) return null;
  if (/cursorMove|multiCursor|MultiCursor|cursorWord/i.test(file)) return 'inherited-editor';
  const fromCatalog = settingsSectionFromContext(before);
  if (fromCatalog) return fromCatalog;
  if (bundle === 'desktop' && !isCursorDesktopModule(file) && prop !== 'command-title' && prop !== 'nls') {
    return null;
  }
  if (prop === 'command-title' || prop === 'nls') {
    const idHit = /id\s*:\s*"(?:cursor|composer|aichat|glass|mcp|bugbot|automation|agent)[.\w]*/i.test(before);
    const moduleHit = /composer|glass|mcp|automation|bugbot|agent/i.test(file) && !/userAgent/i.test(file);
    if (idHit || moduleHit) return 'command-palette';
    return 'inherited-editor';
  }
  if (isInheritedEditorModule(file) && !/cursor|composer|glass|agent/.test(folded)) {
    return 'inherited-editor';
  }
  if (/automat/.test(folded)) return 'automations';
  if (/onboard|getstarted|getting-started|walkthrough|checklist|first-project/.test(folded)) return 'onboarding';
  if (/plugin|mcp|customize|slashmenu|slash-menu/.test(folded) || /(^|[-.])(rules|skills|hooks)\.js$/.test(folded)) {
    return 'customize';
  }
  if (/project/.test(folded)) return 'projects';
  if (/appearance/.test(folded)) return 'settings-appearance';
  if (/profile-settings|profile-handle/.test(folded)) return 'settings-profile';
  if (/plan-usage|usage-limit|billing|get-more-usage/.test(folded)) return 'settings-plan';
  if (/voice/.test(folded)) return 'settings-voice';
  if (/model-picker|modelpicker|models-config|models-catalog|models-provider/.test(folded)) return 'settings-models';
  if (/beta-/.test(folded)) return 'settings-beta';
  if (/network-settings|browser-integration|browser-settings|browserintegration/.test(folded)) return 'settings-browser';
  if (/indexing|lsp-settings|codebase/.test(folded)) return 'settings-indexing';
  if (/git-pr|worktree|pull-request|source-control/.test(folded) && /setting/.test(folded)) return 'settings-scm';
  if (/settings|settingscatalog|general-config|general-layout|general-preferences|privacy-settings|autorun/.test(folded)) {
    if (/agent|chat|composer/.test(folded)) return 'settings-agents';
    if (/general|privacy|account|layout|startup|notification/.test(folded)) return 'settings-general';
    return 'settings-other';
  }
  if (/tool-call|toolcall|transcript|activity-group|turn-action|approval|status-line|status-dot|status-icon/.test(folded)) {
    return 'conversation';
  }
  if (/sidebar|agent-list|agent-tab/.test(folded)) return 'agent-list';
  if (/empty-state|quickstart|composer|placeholder|mention|palette-search/.test(folded)) return 'home-composer';
  if (/review|changes-sidebar|diff-tab|diff-list|default-diff|virtualizeddiff/.test(folded)) return 'review-diff';
  if (/browser-favorites|browser-pane|terminal-hint|terminal-profile|simple-browser/.test(folded)) return 'panes';
  if (/dialog|toast|banner|notice|modal|tray|confirm/.test(folded)) return 'dialogs';
  const lower = String(text || '').toLowerCase();
  if (/plugin|mcp server|\bskill\b|\bhooks?\b/.test(lower)) return 'customize';
  if (/automation/.test(lower)) return 'automations';
  if (/pull request|\bdiff\b|\breview\b/.test(lower)) return 'review-diff';
  if (/\bbrowser\b|\bterminal\b/.test(lower)) return 'panes';
  if (/setting/.test(lower)) return 'settings-other';
  return 'other';
}

function readQuoted(source, index) {
  let text = '';
  let cursor = index;
  while (cursor < source.length && text.length <= 200) {
    const ch = source[cursor];
    if (ch === '\\') {
      const next = source[cursor + 1];
      if (next == null) return null;
      if (next === 'u' && /[0-9a-fA-F]{4}/.test(source.slice(cursor + 2, cursor + 6))) {
        text += String.fromCharCode(parseInt(source.slice(cursor + 2, cursor + 6), 16));
        cursor += 6;
        continue;
      }
      text += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
      cursor += 2;
      continue;
    }
    if (ch === '"') return { text, end: cursor + 1 };
    text += ch;
    cursor += 1;
  }
  return null;
}

function moduleAt(modules, index) {
  let lo = 0;
  let hi = modules.length - 1;
  let name = '';
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (modules[mid].index <= index) {
      name = modules[mid].name;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return name;
}

function contextSkips(before) {
  const tail = before.slice(-80);
  return /console\.|\.debug\(|\.warn\(|\.trace\(|\.info\(|trackEvent\(|telemetry|logService/.test(tail);
}

function propName(raw) {
  if (raw.startsWith('xt(')) return 'nls';
  if (raw.startsWith('title') && raw.includes('value')) return 'command-title';
  if (raw.startsWith('children')) return 'children';
  const name = raw.match(/^[A-Za-z-]+/);
  return name ? name[0] : 'label';
}

function cursorCommandNearby(before) {
  return /id\s*:\s*"(?:cursor|composer|aichat|glass|agent|mcp|bugbot|automation)[.\w]*/i.test(before.slice(-280));
}

export function extractCoverageCandidates(source, options = {}) {
  const bundle = options.bundle || 'glass';
  const modules = [];
  MODULE_PATTERN.lastIndex = 0;
  let marker;
  while ((marker = MODULE_PATTERN.exec(source))) {
    modules.push({ name: marker[1], index: marker.index });
  }
  const found = new Map();
  PROP_PATTERN.lastIndex = 0;
  let match;
  while ((match = PROP_PATTERN.exec(source))) {
    const quoteAt = match.index + match[0].length;
    const parsed = readQuoted(source, quoteAt);
    if (!parsed || !isUserVisibleText(parsed.text)) continue;
    const before = source.slice(Math.max(0, match.index - 120), match.index);
    if (contextSkips(before)) continue;
    let prop = propName(match[0]);
    const around = source.slice(Math.max(0, match.index - 280), match.index + 40);
    if (prop === 'command-title' && !cursorCommandNearby(around)) {
      prop = 'title';
    }
    if (prop === 'nls' && bundle === 'desktop' && !cursorCommandNearby(around)) {
      continue;
    }
    const moduleName = moduleAt(modules, match.index);
    if ((prop === 'loading' || prop === 'completed' || prop === 'error') && !/tool-call|toolcall|transcript/i.test(moduleName)) {
      continue;
    }
    if (prop === 'message' && !/dialog|toast|notification|banner|notice|confirm|modal/i.test(`${moduleName} ${around}`)) {
      continue;
    }
    if (bundle === 'desktop' && !isCursorDesktopModule(moduleName) && prop !== 'command-title' && prop !== 'nls') {
      continue;
    }
    if (prop === 'children' && !parsed.text.includes(' ') && parsed.text.length > 24) continue;
    const area = classifyArea(moduleName, parsed.text, prop, bundle, around);
    if (!area) continue;
    const text = parsed.text.trim();
    const prev = found.get(text);
    if (!prev || AREA_INDEX.get(area) < AREA_INDEX.get(prev.area)) {
      found.set(text, { text, area, prop, module: moduleName, bundle });
    }
  }
  return [...found.values()];
}

export function isCoveredByDictionary(text, compiled) {
  const core = String(text).trim();
  if (compiled.exact.has(core)) return true;
  for (const entry of compiled.regex) {
    entry.re.lastIndex = 0;
    if (entry.re.test(core)) return true;
  }
  for (const frag of compiled.fragments) {
    if (frag.from === core) return true;
  }
  return false;
}

export function summarizeCoverage(candidates, compiled) {
  const byArea = {};
  for (const [id] of COVERAGE_AREAS) {
    byArea[id] = { total: 0, translated: 0, untranslated: 0, missing: [] };
  }
  const seen = new Set();
  let total = 0;
  let translated = 0;
  for (const item of candidates) {
    if (seen.has(item.text)) continue;
    seen.add(item.text);
    const bucket = byArea[item.area] || byArea.other;
    bucket.total += 1;
    total += 1;
    if (isCoveredByDictionary(item.text, compiled)) {
      bucket.translated += 1;
      translated += 1;
    } else {
      bucket.untranslated += 1;
      bucket.missing.push(item.text);
    }
  }
  for (const bucket of Object.values(byArea)) {
    bucket.missing.sort((a, b) => a.localeCompare(b));
  }
  return {
    total,
    translated,
    untranslated: total - translated,
    byArea,
  };
}

function percent(translated, total) {
  if (!total) return '—';
  return `${Math.round((translated / total) * 1000) / 10}%`;
}

export function renderCoverageMarkdown(summary, options = {}) {
  const version = options.version || '3.25.6';
  const previous = options.previous || null;
  const lines = [
    `# Cursor ${version} Agents Window coverage`,
    '',
    'Unique user-visible strings taken from UI props (`label`, `title`, `placeholder`, `description`, `tooltip`, `ariaLabel`, headings, button text, toast/dialog messages), JSX text children, `xt()` command titles, and Cursor command-palette titles.',
    '',
    'Glass is `workbench.glass.main.js`. Desktop counts only Cursor-specific modules and Cursor/Agents command titles in `workbench.desktop.main.js`. Code identifiers, CSS classes, URLs, log/telemetry strings, protobuf fields, and error internals are not candidates.',
    '',
    'A string counts as translated when the whole label is an `exact.json` entry, a whole-string fragment, or a `^...$` regex. Brand names may remain inside an otherwise translated sentence.',
    '',
    `| | Candidates | Translated | Untranslated | Coverage |`,
    `| --- | ---: | ---: | ---: | ---: |`,
  ];
  if (previous) {
    lines.push(`| Before this pass | ${previous.total} | ${previous.translated} | ${previous.untranslated} | ${percent(previous.translated, previous.total)} |`);
  }
  lines.push(`| After this pass | ${summary.total} | ${summary.translated} | ${summary.untranslated} | ${percent(summary.translated, summary.total)} |`);
  lines.push('');
  lines.push('| Area | Candidates | Translated | Untranslated | Coverage | Before |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [id, label] of COVERAGE_AREAS) {
    const bucket = summary.byArea[id];
    const before = previous && previous.byArea ? previous.byArea[id] : null;
    const beforeText = before ? percent(before.translated, before.total) : '—';
    lines.push(`| ${label} | ${bucket.total} | ${bucket.translated} | ${bucket.untranslated} | ${percent(bucket.translated, bucket.total)} | ${beforeText} |`);
  }
  lines.push('');
  lines.push('## Intentionally left in English');
  lines.push('');
  lines.push('- Inherited editor and classic VS Code command titles stay with the marketplace language pack `MS-CEINTL.vscode-language-pack-zh-hans`. This patch does not replace that pack, and the native macOS menu bar is outside the DOM.');
  lines.push('- Product and protocol names stay as written: Cursor, Slack, MCP, LSP, GitHub, Claude, Glass, Tab (the Cursor Tab product), and similar brands.');
  lines.push('- Strings inside editor text, terminal output, diff line contents, and model or human chat markdown are not candidates, so they are never rewritten.');
  lines.push('- Search-alias lists are not shown as labels, so they are not translated.');
  lines.push('');
  lines.push('## Still untranslated in the Agents window and settings');
  lines.push('');
  lines.push('These are the remaining UI strings in the priority areas. Inherited editor titles are counted above and not listed one by one.');
  lines.push('');
  const priority = COVERAGE_AREAS.filter(([id]) => id !== 'inherited-editor').map(([id]) => id);
  for (const id of priority) {
    const bucket = summary.byArea[id];
    if (!bucket.missing.length) continue;
    const label = COVERAGE_AREAS.find(([area]) => area === id)[1];
    lines.push(`### ${label}`);
    lines.push('');
    for (const text of bucket.missing) lines.push(`- ${text}`);
    lines.push('');
  }
  lines.push('This file lists UI strings and counts only. It does not contain Cursor source.');
  lines.push('');
  return lines.join('\n');
}

export const COVERAGE_GROUPS = [
  ['glass-ui', 'Glass UI'],
  ['core-nls', 'Core nls in the Agents window'],
  ['errors-toasts', 'Errors, toasts, dialogs'],
  ['macos-only', 'macOS-only'],
];

export function isCoverageCandidate(text) {
  const value = String(text || '').trim();
  if (!value || value.length > 180) return false;
  if (/[<>]|&&|agentKv:|bubbleId:|ItemTable|SQLite|WAL sidecar|Freelist|B-tree/.test(value)) return false;
  if (/^(Icon for |The color |Controls whether |Whether )/.test(value)) return false;
  if (/^[a-z]/.test(value)) return false;
  if (!/[A-Za-z]{3,}/.test(value)) return false;
  const compact = value.replace(/\s+/g, '');
  if (/^[⌘⌥⇧⌃]+[A-Za-z⏎]?$/.test(compact)) return false;
  if (/^[⌘⌥⇧⌃+⏎\s]+$/.test(value)) return false;
  if (/[⌘⌥⇧]/.test(value) && !/[a-z]{3,}/.test(value)) return false;
  const chord = value.replace(/[⌘⌥⇧⌃+\s⏎]/g, '');
  if (/[⌘⌥⇧]/.test(value) && /^(Enter|Tab|Space|Esc|Return|Delete|Backspace|[A-Z])+$/.test(chord)) return false;
  return true;
}

export function isErrorToastText(text) {
  const value = String(text || '').trim();
  return /^(Unable to |Failed to |Could not |Cannot |Can't |An unknown error|An error occurred|Please restart|Please close|Warning: |Error: )/i.test(value);
}

export function classifyGroup(item) {
  const text = String(item && item.text || '');
  if (item && item.macos) return 'macos-only';
  if (/[⌘⌥⇧]/.test(text) || text === 'This Mac' || /for iOS\b/.test(text)) return 'macos-only';
  if (isErrorToastText(text) || (item && item.area === 'dialogs')) return 'errors-toasts';
  if (item && item.source === 'nls') return 'core-nls';
  return 'glass-ui';
}

export function summarizeGroups(candidates, compiled) {
  const byGroup = {};
  for (const [id] of COVERAGE_GROUPS) {
    byGroup[id] = { total: 0, translated: 0, untranslated: 0, missing: [] };
  }
  const seen = new Set();
  for (const item of candidates) {
    if (!item || seen.has(item.text)) continue;
    seen.add(item.text);
    const id = classifyGroup(item);
    const bucket = byGroup[id] || byGroup['glass-ui'];
    bucket.total += 1;
    if (isCoveredByDictionary(item.text, compiled)) bucket.translated += 1;
    else {
      bucket.untranslated += 1;
      if (bucket.missing.length < 40) bucket.missing.push(item.text);
    }
  }
  return byGroup;
}

export function renderGroupMarkdown(byGroup) {
  const lines = [
    '| Category | Candidates | Translated | Untranslated | Coverage |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const [id, label] of COVERAGE_GROUPS) {
    const bucket = byGroup[id];
    lines.push(`| ${label} | ${bucket.total} | ${bucket.translated} | ${bucket.untranslated} | ${percent(bucket.translated, bucket.total)} |`);
  }
  return lines.join('\n');
}

const QUOTED = /"((?:\\.|[^"\\]){2,220})"/g;

export function extractSpecialLiterals(source) {
  const found = new Map();
  QUOTED.lastIndex = 0;
  let match;
  const text = String(source || '');
  while ((match = QUOTED.exec(text))) {
    let value = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_all, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\(.)/g, '$1');
    value = value.trim();
    if (!value || value.length > 220) continue;
    const macos = /[⌘⌥⇧]/.test(value) || value === 'This Mac' || /for iOS\b/.test(value);
    const error = isErrorToastText(value);
    if (!macos && !error) continue;
    if (!/[A-Za-z]/.test(value) && !macos) continue;
    if (!found.has(value)) found.set(value, { text: value, macos, source: 'glass', area: error ? 'dialogs' : 'other' });
  }
  return [...found.values()];
}

export function nlsGroupCandidates(rows) {
  const found = [];
  const seen = new Set();
  for (const row of rows) {
    const text = String(row.en || '').trim();
    if (!text || seen.has(text) || text.includes('{') || text.length > 220) continue;
    if (!/[A-Za-z]/.test(text)) continue;
    const error = isErrorToastText(text);
    const keep = error || /notification|dialog|shellEnv/i.test(`${row.module} ${row.key}`);
    if (!keep) continue;
    seen.add(text);
    found.push({ text, source: 'nls', area: error ? 'dialogs' : 'other', macos: false });
  }
  return found;
}
