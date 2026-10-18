import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chownInvokingUser,
  cursorResourceFromCommand,
  detectAppPath,
  invokingHome,
  macosApplicationCandidates,
  userDataDir,
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

test('sudo keeps backups in the invoking user home', () => {
  assert.equal(invokingHome({ SUDO_USER: 'ada' }, '/var/root', 'darwin', 0), '/Users/ada');
  assert.equal(invokingHome({ SUDO_USER: 'ada' }, '/var/root', 'linux', 0), '/home/ada');
  assert.equal(invokingHome({ SUDO_USER: 'ada' }, '/Users/ada', 'darwin', 501), '/Users/ada');
  assert.equal(invokingHome({ SUDO_USER: 'root' }, '/var/root', 'darwin', 0), '/var/root');
  assert.match(userDataDir({ SUDO_USER: 'ada' }), /cursor-zh-hans$/);
});

test('root hands written files back to SUDO_UID', () => {
  const seen = [];
  const ok = chownInvokingUser(['/tmp/cursor-zh-data'], {
    getuid: () => 0,
    env: { SUDO_UID: '501', SUDO_GID: '20' },
    lstatSync() { return { isDirectory: () => false }; },
    chownSync(target, uid, gid) { seen.push([target, uid, gid]); },
  });
  assert.equal(ok, true);
  assert.deepEqual(seen, [['/tmp/cursor-zh-data', 501, 20]]);
  assert.equal(chownInvokingUser(['/tmp/x'], { getuid: () => 501, env: { SUDO_UID: '501', SUDO_GID: '20' } }), false);
  assert.equal(chownInvokingUser(['/tmp/x'], {
    getuid: () => 0,
    env: { SUDO_UID: '501', SUDO_GID: '20' },
    lstatSync() { return { isDirectory: () => false }; },
    chownSync() { throw new Error('eperm'); },
  }), true);
});

test('detectAppPath prefers the install path from the process command', () => {
  const wanted = '/Applications/Agent/Cursor.app/Contents/Resources/app';
  const found = detectAppPath(null, {
    commands: ['/Applications/Agent/Cursor.app/Contents/MacOS/Cursor --some-flag'],
    isCursorApp: (candidate) => candidate === wanted,
  });
  assert.equal(found.appPath, wanted);
});
