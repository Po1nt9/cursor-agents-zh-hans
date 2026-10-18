import { STATIC_MARKER } from './version.js';

const AMBIGUOUS_WORDS = new Set([
  'agent', 'agents', 'file', 'files', 'read', 'chat', 'chats', 'plan', 'plans',
  'cloud', 'run', 'go', 'open', 'new', 'diff', 'diffs', 'ide', 'pr', 'model',
  'models', 'search', 'code', 'tab', 'view', 'edit', 'terminal', 'apply',
  'close', 'save', 'copy', 'name', 'type', 'key', 'value', 'data', 'test',
  'window', 'local', 'remote', 'review', 'commit', 'branch', 'output', 'help',
]);

export function isAmbiguousStaticRule(rule) {
  if (rule.allowAmbiguous === true) return false;
  const literal = rule.literal;
  if (typeof literal !== 'string') return true;
  if (literal.length < 12) return true;
  if (!literal.includes(' ')) return true;
  const tokens = literal.split(/\s+/);
  if (tokens.length === 1 && AMBIGUOUS_WORDS.has(literal.toLowerCase())) return true;
  return false;
}

export function countQuotedLiteral(source, literal, context, windowRadius = 160) {
  const quoted = JSON.stringify(literal);
  let count = 0;
  let index = 0;
  while (index < source.length) {
    const found = source.indexOf(quoted, index);
    if (found < 0) break;
    if (context) {
      const from = Math.max(0, found - windowRadius);
      const to = Math.min(source.length, found + quoted.length + windowRadius);
      if (!source.slice(from, to).includes(context)) {
        index = found + quoted.length;
        continue;
      }
    }
    count += 1;
    index = found + quoted.length;
  }
  return count;
}

export function replaceQuotedLiteral(source, literal, translation, context, windowRadius = 160) {
  const quoted = JSON.stringify(literal);
  const replacement = JSON.stringify(translation);
  let count = 0;
  let out = '';
  let index = 0;
  while (index < source.length) {
    const found = source.indexOf(quoted, index);
    if (found < 0) {
      out += source.slice(index);
      break;
    }
    if (context) {
      const from = Math.max(0, found - windowRadius);
      const to = Math.min(source.length, found + quoted.length + windowRadius);
      if (!source.slice(from, to).includes(context)) {
        out += source.slice(index, found + quoted.length);
        index = found + quoted.length;
        continue;
      }
    }
    count += 1;
    out += source.slice(index, found) + replacement;
    index = found + quoted.length;
  }
  return { source: out, count };
}

export function applyStaticReplacements(source, rules, version) {
  const reports = [];
  const applicable = [];
  for (const rule of rules) {
    if (!rule || !rule.id || typeof rule.literal !== 'string' || typeof rule.translation !== 'string') {
      return {
        ok: false,
        source,
        changed: false,
        reports: [{ id: rule?.id || '?', status: 'invalid' }],
      };
    }
    if (isAmbiguousStaticRule(rule)) {
      reports.push({ id: rule.id, status: 'skipped-ambiguous', literal: rule.literal });
      continue;
    }
    const expected = rule.expectedHits ? rule.expectedHits[version] : undefined;
    if (expected == null) {
      reports.push({ id: rule.id, status: 'skipped-no-count', version });
      continue;
    }
    const actual = countQuotedLiteral(source, rule.literal, rule.context);
    if (actual !== expected) {
      reports.push({
        id: rule.id,
        status: 'mismatch',
        literal: rule.literal,
        expected,
        actual,
      });
      return { ok: false, source, changed: false, reports };
    }
    applicable.push(rule);
    reports.push({ id: rule.id, status: 'ready', count: actual });
  }

  let next = source;
  for (const rule of applicable) {
    const replaced = replaceQuotedLiteral(next, rule.literal, rule.translation, rule.context);
    if (replaced.count !== rule.expectedHits[version]) {
      reports.push({
        id: rule.id,
        status: 'mismatch-during-apply',
        expected: rule.expectedHits[version],
        actual: replaced.count,
      });
      return { ok: false, source, changed: false, reports };
    }
    next = replaced.source;
  }
  const changed = next !== source;
  return { ok: true, source: next, changed, reports };
}

export function withStaticMarker(source) {
  if (source.includes(STATIC_MARKER)) return source;
  const suffix = source.endsWith('\n') ? '' : '\n';
  return `${source}${suffix}${STATIC_MARKER}\n`;
}
