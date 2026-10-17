import assert from 'node:assert/strict';
import test from 'node:test';
import { readMacEntitlements, runMacPostProcess } from '../src/macos.js';

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

test('doctor can see an empty entitlement plist', () => {
  const empty = readMacEntitlements('/Applications/Cursor.app', () => '');
  assert.equal(empty.missing, true);
  const present = readMacEntitlements('/Applications/Cursor.app', () => '<?xml version="1.0"?><plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>');
  assert.equal(present.missing, false);
  const unsigned = readMacEntitlements('/Applications/Cursor.app', () => {
    const error = new Error('code object is not signed at all');
    error.stderr = 'code object is not signed at all';
    throw error;
  });
  assert.equal(unsigned.missing, true);
});
