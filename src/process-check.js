import { execFileSync } from 'node:child_process';

export function parsePs(output) {
  const rows = [];
  for (const line of String(output).split(/\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), comm: match[2].trim() });
  }
  return rows;
}

export function parseTasklist(output) {
  const rows = [];
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^"([^"]+)","(\d+)"/);
    if (!match) continue;
    rows.push({ pid: Number(match[2]), comm: match[1] });
  }
  return rows;
}

export function isCursorComm(comm, platform) {
  const name = String(comm || '').trim();
  if (!name) return false;
  if (platform === 'darwin') {
    return name === 'Cursor' || name.startsWith('Cursor Helper');
  }
  if (platform === 'win32') {
    return /^cursor\.exe$/i.test(name);
  }
  return name === 'cursor';
}

export function findCursorPids(processes, platform, selfPid = process.pid) {
  return processes
    .filter((item) => item.pid !== selfPid && isCursorComm(item.comm, platform))
    .map((item) => item.pid);
}

export function listProcesses(platform = process.platform, execFile = execFileSync) {
  if (platform === 'win32') {
    const output = execFile('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' });
    return parseTasklist(output);
  }
  const output = execFile('ps', ['-ax', '-o', 'pid=', '-o', 'comm='], { encoding: 'utf8' });
  return parsePs(output);
}

export function inspectCursorProcesses(options = {}) {
  const platform = options.platform ?? process.platform;
  const execFile = options.execFile ?? execFileSync;
  try {
    const processes = listProcesses(platform, execFile);
    const pids = findCursorPids(processes, platform, options.selfPid ?? process.pid);
    return { checked: true, running: pids.length > 0, pids, platform };
  } catch (error) {
    return { checked: false, running: false, pids: [], platform, error: error.message };
  }
}
