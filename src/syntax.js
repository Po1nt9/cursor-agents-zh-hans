import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function assertJavaScriptSyntax(source, filename = 'patched.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-syntax-'));
  const file = path.join(dir, filename);
  try {
    fs.writeFileSync(file, source);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : error.message;
    throw new Error(`JavaScript 语法检查失败 (${filename}): ${stderr}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
