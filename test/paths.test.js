import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cursorResourceFromCommand,
  detectAppPath,
  macosApplicationCandidates,
} from '../src/paths.js';

test('macOS candidates include one subdirectory under Applications', () => {
  const apps = macosApplicationCandidates('/Users/me', (root) => {
    if (root === '/Applications') return ['Agent', 'Cursor.app', 'Safari.app', '.hidden'];
    const error = new Error('missing');
    error.code = 'ENOENT';
    throw error;
  });
  assert.ok(apps.includes('/Applications/Cursor.app/Contents/Resources/app'));
  assert.ok(apps.includes('/Applications/Agent/Cursor.app/Contents/Resources/app'));
  assert.equal(apps.includes('/Applications/Safari.app/Cursor.app/Contents/Resources/app'), false);
  assert.ok(apps.includes('/Users/me/Applications/Cursor.app/Contents/Resources/app'));
});

test('a running Cursor command line points at its resources directory', () => {
  assert.equal(
    cursorResourceFromCommand('/Applications/Agent/Cursor.app/Contents/MacOS/Cursor'),
    '/Applications/Agent/Cursor.app/Contents/Resources/app',
  );
  assert.equal(
    cursorResourceFromCommand('/usr/share/cursor/resources/app/cursor --no-sandbox'),
    '/usr/share/cursor/resources/app',
  );
  assert.equal(cursorResourceFromCommand('cursor'), null);
});

test('detectAppPath prefers the install path from the process command', () => {
  const wanted = '/Applications/Agent/Cursor.app/Contents/Resources/app';
  const found = detectAppPath(null, {
    commands: ['/Applications/Agent/Cursor.app/Contents/MacOS/Cursor --some-flag'],
    isCursorApp: (candidate) => candidate === wanted,
  });
  assert.equal(found.appPath, wanted);
});
