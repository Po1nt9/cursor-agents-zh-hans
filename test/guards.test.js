import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDictionary } from '../src/dictionary.js';
import { lintChinese, lintDictionary } from '../src/style.js';

const ENGLISH_RUN = /\b[A-Za-z]{2,}(?:[ ,'’-]+[a-z]{2,}){1,}\b/;

// Brands, protocols, product names, and key labels that stay in Latin.
const ALLOW = new Set(`
Cursor GitHub GitLab Git MCP API URL URI JSON SSH HTTP HTTPS CSS HTML SVG PNG PDF
Docker WSL CLI IDE Canvas Glass Origin Slack Linear Datadog Sentry OpenAI Claude
Grok Anthropic Bugbot LSP OAuth AWS Azure Google Microsoft React Python Node npm
YAML Markdown Mermaid macOS Windows Linux Chrome Chromium Electron Playwright Figma
Notion Stripe Tab Ultra Pro Enterprise Shell True False null undefined Ctrl Alt
Shift Enter Esc Cmd VSCode VS Copilot Bedrock Prisma Supabase Statsig Sentry
Kubernetes Terraform GraphQL WebSocket localhost npmjs POSIX UTF Unicode ASCII
JWT OIDC SAML CORS CSRF CDN DNS TCP UDP TLS SSL IPv4 IPv6 GPU CPU RAM SSD CI CD
PR ID OK UI UX AI ML NLP SQL NoSQL Graphite Notion PagerDuty Databricks Granola
1Password xAI SpaceXAI
`.split(/\s+/).filter(Boolean));

function residue(chinese) {
  let text = String(chinese)
    .replace(/`[^`]*`/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\b[\w$]+(?:\.[\w$]+)+\([^)]*\)/g, ' ')
    .replace(/\b[A-Za-z_][\w$]*\([^)]*\)/g, ' ')
    .replace(/\$\([^)]*\)/g, ' ')
    .replace(/\b[A-Za-z]+(?:[_-][A-Za-z0-9]+)+\b/g, ' ')
    .replace(/\b[a-z]+[A-Z][\w$]*\b/g, ' ')
    .replace(/\b[A-Z]{2,6}\b/g, ' ')
    .replace(/\b(?:git|npm|pnpm|yarn|dev)\b(?:\s+[\w.-]+)*/g, ' ')
    .replace(/\bGuido van Rossum\b/g, ' ');
  text = text.replace(/\b[A-Za-z][A-Za-z0-9.+]*\b/g, (word) => (ALLOW.has(word) ? ' ' : word));
  return ENGLISH_RUN.exec(text);
}

test('dictionary keys do not keep literal nls placeholders', () => {
  const { raw } = loadDictionary();
  const dead = Object.keys(raw.exact).filter((key) => /\{\d+\}/.test(key));
  assert.deepEqual(dead, []);
});

test('translations do not put full-width brackets inside code tokens', () => {
  const { raw } = loadDictionary();
  const problems = lintDictionary(raw).filter((item) => item.issue === 'fullwidth-code-paren');
  assert.deepEqual(problems, []);
});

test('translations do not leave an English phrase beside Chinese', () => {
  const { raw } = loadDictionary();
  const hits = [];
  for (const [en, zh] of Object.entries(raw.exact)) {
    const found = residue(zh);
    if (found) hits.push(`${en} => ${zh} [${found[0]}]`);
  }
  for (const entry of raw.regex) {
    const found = residue(entry.replacement);
    if (found) hits.push(`${entry.id || entry.pattern} => ${entry.replacement} [${found[0]}]`);
  }
  assert.deepEqual(hits, []);
});

test('code tokens keep ASCII calls and prose keeps full-width parens', () => {
  assert.equal(lintChinese('render()', '无法在多次 render() 操作中使用同一个画布。').includes('fullwidth-code-paren'), false);
  assert.equal(lintChinese('render()', '无法在多次 render() 操作中使用同一个画布。').includes('halfwidth-paren'), false);
  assert.ok(lintChinese('render()', '无法在多次 render（） 操作中使用同一个画布。').includes('fullwidth-code-paren'));
  assert.ok(lintChinese('Use (2, 3)', '请选择（一项）。').includes('halfwidth-paren') === false);
  assert.ok(lintChinese('note', '请选择(一项)。').includes('halfwidth-paren'));
});
