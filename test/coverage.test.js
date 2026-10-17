import assert from 'node:assert/strict';
import test from 'node:test';
import { compileDictionary } from '../src/engine.js';
import {
  classifyArea,
  extractCoverageCandidates,
  isUserVisibleText,
  renderCoverageMarkdown,
  summarizeCoverage,
} from '../src/coverage.js';

test('visible-text filter drops identifiers, css, urls, and logs stay out of props', () => {
  assert.equal(isUserVisibleText('New Agent'), true);
  assert.equal(isUserVisibleText('Show rotating tips on the empty screen'), true);
  assert.equal(isUserVisibleText('camelCase'), false);
  assert.equal(isUserVisibleText('glass-6s0dn4'), false);
  assert.equal(isUserVisibleText('https://cursor.com/docs'), false);
  assert.equal(isUserVisibleText('ERROR_CODE'), false);
  assert.equal(isUserVisibleText('foo_bar'), false);

  const source = [
    '"empty-state.js"(){',
    'label:"New Agent",searchAliases:["agents"],',
    'description:"Show rotating tips on the empty screen",',
    'console.log("Ignored Log Line");label:"Skipped Because Logged"',
    '}',
  ].join('');
  const found = extractCoverageCandidates(source, { bundle: 'glass' });
  const texts = found.map((item) => item.text).sort();
  assert.deepEqual(texts, ['New Agent', 'Show rotating tips on the empty screen']);
  assert.equal(found.find((item) => item.text === 'New Agent').area, 'home-composer');
});

test('settings catalog sections and cursor commands are classified', () => {
  assert.equal(
    classifyArea('settingsCatalog.js', 'Tips', 'label', 'glass', 'Tu("appearance","theme",{label:'),
    'settings-appearance',
  );
  const source = [
    '"actions.js"(){',
    'super({id:"cursor.newAgent",title:{value:"New Agent",original:"New Agent"}})',
    '}',
    '"userAgent.js"(){label:"Do Not Keep This Desktop String"}',
  ].join('');
  const found = extractCoverageCandidates(source, { bundle: 'desktop' });
  assert.deepEqual(found.map((item) => item.text), ['New Agent']);
  assert.equal(found[0].area, 'command-palette');
});

test('coverage summary and markdown count translated labels', () => {
  const compiled = compileDictionary({
    exact: { 'New Agent': '新建智能体' },
    fragments: [],
    regex: [{ id: 'files', pattern: '^(\\d+) files?$', flags: '', replacement: '$1 个文件' }],
  });
  const summary = summarizeCoverage([
    { text: 'New Agent', area: 'home-composer' },
    { text: '3 files', area: 'review-diff' },
    { text: 'Still English', area: 'dialogs' },
  ], compiled);
  assert.equal(summary.total, 3);
  assert.equal(summary.translated, 2);
  assert.equal(summary.byArea.dialogs.untranslated, 1);
  const markdown = renderCoverageMarkdown(summary, {
    version: '3.25.6',
    previous: { total: 3, translated: 1, untranslated: 2, byArea: { 'home-composer': { total: 1, translated: 0 } } },
  });
  assert.match(markdown, /Agents window home \/ composer/);
  assert.match(markdown, /Still English/);
  assert.match(markdown, /Before this pass/);
  assert.doesNotMatch(markdown, /function\s*\(/);
});
