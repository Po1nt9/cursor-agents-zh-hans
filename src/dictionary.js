import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDictionary } from './engine.js';

export function defaultDictionaryDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dictionary');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadDictionaryRaw(dir) {
  const root = dir || defaultDictionaryDir();
  const exact = readJson(path.join(root, 'exact.json'));
  const fragments = readJson(path.join(root, 'fragments.json'));
  const regex = readJson(path.join(root, 'regex.json'));
  const placeholderFile = path.join(root, 'placeholders.json');
  const placeholders = fs.existsSync(placeholderFile) ? readJson(placeholderFile) : [];
  const nlsFile = path.join(root, 'nls.json');
  const nlsRegexFile = path.join(root, 'nls-regex.json');
  const nls = fs.existsSync(nlsFile) ? readJson(nlsFile) : {};
  const nlsRegex = fs.existsSync(nlsRegexFile) ? readJson(nlsRegexFile) : [];
  if (!nls || typeof nls !== 'object' || Array.isArray(nls)) throw new Error('nls.json 必须是对象');
  if (!Array.isArray(nlsRegex)) throw new Error('nls-regex.json 必须是数组');
  for (const from of Object.keys(nls)) {
    if (!Object.prototype.hasOwnProperty.call(exact, from)) exact[from] = nls[from];
  }
  regex.push(...nlsRegex);
  if (!exact || typeof exact !== 'object' || Array.isArray(exact)) {
    throw new Error('exact.json 必须是对象');
  }
  if (!Array.isArray(fragments)) throw new Error('fragments.json 必须是数组');
  if (!Array.isArray(regex)) throw new Error('regex.json 必须是数组');
  if (!Array.isArray(placeholders)) throw new Error('placeholders.json 必须是数组');
  return { exact, fragments, regex, placeholders };
}

export function loadDictionary(dir = defaultDictionaryDir()) {
  const raw = loadDictionaryRaw(dir);
  return { raw, compiled: compileDictionary(raw) };
}

export function loadStaticRules(dir) {
  const file = path.join(dir || defaultDictionaryDir(), 'static-glass.json');
  const data = readJson(file);
  if (!data || !Array.isArray(data.rules)) {
    throw new Error('static-glass.json 缺少 rules 数组');
  }
  return data;
}
