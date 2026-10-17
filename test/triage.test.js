import assert from 'node:assert/strict';
import test from 'node:test';
import { triageCandidate } from '../src/triage.js';
import { extractCoverageCandidates, extractSpecialLiterals } from '../src/coverage.js';

test('triage keeps real UI and drops noise buckets', () => {
  assert.equal(triageCandidate('Failed to checkout branch').kind, 'real');
  assert.equal(triageCandidate('About').kind, 'real');
  assert.equal(triageCandidate('GitHub').kind, 'english');
  assert.equal(triageCandidate('Claude 3.7 Sonnet').bucket, 'model-name');
  assert.equal(triageCandidate('Enter').bucket, 'shortcut');
  assert.equal(triageCandidate('Altair').bucket, 'voice-name');
  assert.equal(triageCandidate('BigInt').bucket, 'internal-id');
  assert.equal(triageCandidate('BracketPairColorization').bucket, 'internal-id');
  assert.equal(triageCandidate('https://cursor.com/docs').bucket, 'url');
  assert.equal(triageCandidate('Copy cursor.com link (file only)').kind, 'real');
  assert.equal(triageCandidate('Clear Statsig Cache').bucket, 'telemetry');
  assert.equal(triageCandidate("Can't get element").bucket, 'log-only');
  assert.equal(triageCandidate('Developer: Toggle Auth Debugging').bucket, 'dev-only');
  assert.equal(triageCandidate('Glass Startup Performance').bucket, 'debug-panel');
  assert.equal(triageCandidate('True').bucket, 'enum-key');
});

test('hex escapes in UI strings decode to the character users see', () => {
  const source = '"hint.js"(){placeholder:"Enter to send \\xB7 Esc to skip"}';
  const found = extractCoverageCandidates(source, { bundle: 'glass' });
  assert.equal(found[0].text, 'Enter to send · Esc to skip');
  const literals = extractSpecialLiterals('const s="Failed to save \\xB7 retry";');
  assert.equal(literals[0].text, 'Failed to save · retry');
});
