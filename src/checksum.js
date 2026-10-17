import crypto from 'node:crypto';

export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** VS Code / Cursor product.json checksum: SHA-256, standard base64, padding stripped. */
export function sha256Base64(data) {
  return crypto.createHash('sha256').update(data).digest('base64').replace(/=+$/g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceChecksum(raw, checksumKey, oldHash, newHash) {
  if (oldHash === newHash) return { raw, changed: false };
  const pattern = new RegExp(
    `("${escapeRegExp(checksumKey)}"\\s*:\\s*")${escapeRegExp(oldHash)}(")`,
  );
  const matches = raw.match(new RegExp(pattern.source, 'g'));
  if (!matches || matches.length !== 1) {
    throw new Error(`无法在 product.json 中唯一找到校验和 ${checksumKey}`);
  }
  return { raw: raw.replace(pattern, `$1${newHash}$2`), changed: true };
}

export function checksumKeyForRel(rel) {
  if (rel === 'product.json') return null;
  const prefix = 'out/';
  if (!rel.startsWith(prefix)) return null;
  return rel.slice(prefix.length);
}
