import { HTML_MARKER_END, HTML_MARKER_START } from './version.js';

export function injectionBlock(scriptName = 'cursor-zh-hans.js', indent = '') {
  return [
    `${indent}${HTML_MARKER_START}`,
    `${indent}<script src="./${scriptName}"></script>`,
    `${indent}${HTML_MARKER_END}`,
    '',
  ].join('\n');
}

export function injectHtml(html, scriptName = 'cursor-zh-hans.js') {
  if (html.includes(HTML_MARKER_START)) {
    return { html, already: true };
  }
  const anchor = '<script src="./workbench.js"';
  const index = html.indexOf(anchor);
  if (index < 0) {
    throw new Error('找不到 workbench.js 脚本标签。Glass 与经典窗口共用这份 workbench.html，注入点必须存在。');
  }
  const lineStart = html.lastIndexOf('\n', index - 1) + 1;
  const prefix = html.slice(lineStart, index);
  const indent = /^[\t ]*$/.test(prefix) ? prefix : '';
  const insertAt = indent ? lineStart : index;
  const block = injectionBlock(scriptName, indent);
  return { html: html.slice(0, insertAt) + block + html.slice(insertAt), already: false };
}

export function removeInjection(html) {
  const start = html.indexOf(HTML_MARKER_START);
  if (start < 0) return { html, removed: false };
  const end = html.indexOf(HTML_MARKER_END, start);
  if (end < 0) throw new Error('workbench.html 的注入标记不完整');
  const lineStart = html.lastIndexOf('\n', start - 1) + 1;
  const removeFrom = /^[\t ]*$/.test(html.slice(lineStart, start)) ? lineStart : start;
  let removeEnd = end + HTML_MARKER_END.length;
  if (html[removeEnd] === '\n') removeEnd += 1;
  return { html: html.slice(0, removeFrom) + html.slice(removeEnd), removed: true };
}
