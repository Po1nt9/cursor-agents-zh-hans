import fs from 'node:fs';

export function readProductFile(productPath) {
  const raw = fs.readFileSync(productPath, 'utf8');
  const json = JSON.parse(raw);
  if (!json || typeof json !== 'object') throw new Error('product.json 无法解析');
  if (json.applicationName !== 'cursor' && json.nameShort !== 'Cursor') {
    throw new Error(`product.json 不是 Cursor（applicationName=${json.applicationName}）`);
  }
  if (!json.version || !json.commit) {
    throw new Error('product.json 缺少 version 或 commit');
  }
  return { raw, json };
}

export function versionKey(product) {
  return `${product.version}+${product.commit}`;
}
