/**
 * Match Cursor's nls.messages.json to the VS Code zh-Hans language pack.
 * The pack is MIT, from microsoft/vscode-loc. English wins when keys differ.
 */

const ERROR_START = /^(Unable to |Failed to |Could not |Cannot |Can't |An unknown error|An error occurred|Please restart|Please close|Warning: |Error: )/i;
const SHORT_BUTTONS = new Set(['OK', 'No', 'Yes', 'Error', 'Warning', 'Info', 'Retry', 'Close', 'Cancel', 'Later', 'Done', 'Skip', 'Trust', 'Revert', 'Install', 'Save', 'Open', 'Copy']);
const SETTING_SKIP = /^(Controls |Whether |The color |Color of |Background |Foreground |Icon for |Border color)/i;
const MODULE_KEEP = /notification|\/dialog|dialogs|shellEnv|integrity|backup|workspaceTrust|workspaces\/|files\/|authentication|update\/|issue\/|request\/|opener|messageBox|quickInput/i;
const EDITOR_SKIP = /\/editor\/|tokenColor|colorTheme|iconTheme/i;

export function alignNls(keys, messages, locContents) {
  const rows = [];
  let index = 0;
  const modules = Array.isArray(keys) ? keys : [];
  const list = Array.isArray(messages) ? messages : [];
  const loc = locContents && typeof locContents === 'object' ? locContents : {};
  for (const entry of modules) {
    if (!entry || !Array.isArray(entry[1])) continue;
    const moduleName = entry[0];
    const body = loc[moduleName];
    const translated = body && typeof body === 'object' ? body : {};
    for (const key of entry[1]) {
      if (index >= list.length) return rows;
      const en = list[index];
      index += 1;
      const zh = translated[key];
      rows.push({
        en: typeof en === 'string' ? en : '',
        zh: typeof zh === 'string' ? zh : '',
        module: String(moduleName || ''),
        key: String(key || ''),
      });
    }
  }
  return rows;
}

export function isAgentsWindowNls(row) {
  if (!row || typeof row.en !== 'string' || typeof row.zh !== 'string') return false;
  const en = row.en.trim();
  const zh = row.zh.trim();
  if (!en || !zh || en === zh) return false;
  if (en.length > 220 || zh.length > 260) return false;
  if (en.includes('{') || en.includes('&&') || /https?:/.test(en)) return false;
  if (SETTING_SKIP.test(en) || EDITOR_SKIP.test(row.module)) return false;
  if (!/[A-Za-z]/.test(en) || !/[\u4e00-\u9fff]/.test(zh)) return false;
  if (!/\s/.test(en) && en.length < 8 && !SHORT_BUTTONS.has(en.replace(/\.{3}$|…$/u, ''))) return false;
  if (MODULE_KEEP.test(row.module) || MODULE_KEEP.test(row.key)) return true;
  return ERROR_START.test(en);
}

export function normalizeOfficialChinese(text) {
  let out = String(text || '').replace(/您/g, '你').replace(/帐户/g, '账户');
  out = out.replace(/(["“”'])\s*:\s*/g, '$1：');
  out = out.replace(/([\u4e00-\u9fff])\.{3}/g, '$1…');
  out = out.replace(/([\u4e00-\u9fff]),\s*/g, '$1，');
  out = out.replace(/([\u4e00-\u9fff]);\s*/g, '$1；');
  out = out.replace(/([\u4e00-\u9fff]):\s*/g, '$1：');
  out = out.replace(/([\u4e00-\u9fff])!\s*/g, '$1！');
  out = out.replace(/([\u4e00-\u9fff])\?\s*/g, '$1？');
  out = out.replace(/([\u4e00-\u9fff])\.(?!\d|\.)/g, '$1。');
  out = out.replace(/([\u4e00-\u9fff])([A-Za-z])/g, '$1 $2');
  out = out.replace(/([A-Za-z])([\u4e00-\u9fff])/g, '$1 $2');
  out = out.replace(/([\u4e00-\u9fff])(\d)/g, '$1 $2');
  out = out.replace(/(\d)([\u4e00-\u9fff])/g, '$1 $2');
  out = out.replace(/(\d)\s+月/g, '$1月');
  out = out.replace(/月\s+(\d)/g, '月$1');
  out = out.replace(/(\d)\s+日/g, '$1日');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/（\s+/g, '（').replace(/\s+）/g, '）');
  return out.trim();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function placeholderRegex(row) {
  if (!row || typeof row.en !== 'string' || typeof row.zh !== 'string') return null;
  const en = row.en.trim();
  const zh = row.zh.trim();
  if (!en || !zh || en === zh) return null;
  if ((en.match(/\{0\}/g) || []).length !== 1) return null;
  if ((zh.match(/\{0\}/g) || []).length !== 1) return null;
  if (en.includes('{1}') || /https?:|&&/.test(en)) return null;
  if (!ERROR_START.test(en) && !/notification|dialog|shellEnv/i.test(`${row.module} ${row.key}`)) return null;
  if (en.length > 180) return null;
  const [before, after] = en.split('{0}');
  const pattern = `^${escapeRegex(before)}(.+)${escapeRegex(after)}$`;
  const replacement = normalizeOfficialChinese(zh).replace('{0}', '$1');
  const id = `nls-${row.module.split('/').pop()}-${row.key}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return { id: id || 'nls-placeholder', pattern, flags: '', replacement };
}

export function selectNlsExact(rows) {
  const out = new Map();
  for (const row of rows) {
    if (!isAgentsWindowNls(row)) continue;
    if (out.has(row.en)) continue;
    out.set(row.en, normalizeOfficialChinese(row.zh));
  }
  return out;
}

export function selectNlsRegex(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const entry = placeholderRegex(row);
    if (!entry || seen.has(entry.pattern)) continue;
    seen.add(entry.pattern);
    out.push(entry);
  }
  return out;
}
