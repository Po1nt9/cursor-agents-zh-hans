import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex } from './checksum.js';
import { versionKey } from './product.js';

export function installKey(appPath) {
  return crypto.createHash('sha256').update(path.resolve(appPath)).digest('hex').slice(0, 16);
}

export function backupRootFor(dataDir, appPath, product) {
  return path.join(dataDir, 'backups', installKey(appPath), versionKey(product));
}

export function backupFilePath(root, rel) {
  return path.join(root, 'files', rel);
}

export function readBackupBytes(root, rel) {
  const file = backupFilePath(root, rel);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

export function ensureBackupBytes(root, rel, bytes, mode) {
  const file = backupFilePath(root, rel);
  if (fs.existsSync(file)) {
    return { file, created: false, sha256: sha256Hex(fs.readFileSync(file)) };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  if (mode != null) fs.chmodSync(file, mode);
  return { file, created: true, sha256: sha256Hex(bytes) };
}

export function readManifest(root) {
  const file = path.join(root, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeManifest(root, manifest) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function ensureManifest(root, product, appPath) {
  const existing = readManifest(root);
  if (existing) return existing;
  const manifest = {
    version: product.version,
    commit: product.commit,
    realCommit: product.realCommit || null,
    appPath: path.resolve(appPath),
    createdAt: new Date().toISOString(),
    files: [],
  };
  writeManifest(root, manifest);
  return manifest;
}

export function recordBackup(manifest, rel, sha256) {
  if (!manifest.files.some((item) => item.rel === rel)) {
    manifest.files.push({ rel, sha256 });
  }
}

export function readState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

export function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function removeState(statePath) {
  if (fs.existsSync(statePath)) fs.rmSync(statePath);
  const dir = path.dirname(statePath);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}
