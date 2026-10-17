import assert from 'node:assert/strict';
import test from 'node:test';
import { runMacPostProcess } from '../src/macos.js';

test('codesign keeps entitlements, requirements, and flags', () => {
  const calls = [];
  const result = runMacPostProcess('/Applications/Cursor.app/Contents/Resources/app', {
    platform: 'darwin',
    execFile(cmd, args) {
      calls.push([cmd, args]);
    },
  });
  const codesign = calls.find((call) => call[0] === 'codesign');
  assert.ok(codesign);
  assert.ok(codesign[1].includes('--preserve-metadata=entitlements,requirements,flags'));
  assert.equal(result.steps.some((step) => step.preservedMetadata === true), true);
});

test('codesign falls back when metadata cannot be preserved', () => {
  const result = runMacPostProcess('/Applications/Cursor.app/Contents/Resources/app', {
    platform: 'darwin',
    clearQuarantine: false,
    execFile(_cmd, args) {
      if (args.includes('--preserve-metadata=entitlements,requirements,flags')) {
        throw new Error('preserve failed');
      }
    },
  });
  assert.equal(result.steps[0].preservedMetadata, false);
  assert.match(result.warnings[0], /entitlements/);
  assert.match(result.warnings[0], /Developer ID/);
});
