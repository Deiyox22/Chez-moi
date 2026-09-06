#!/usr/bin/env node
/** Parses every JavaScript file in the project so a typo never reaches the browser. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'data']);

function walk(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (/\.(m?js)$/.test(entry.name)) found.push(full);
  }
  return found;
}

const files = walk(ROOT);
let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${path.relative(ROOT, file)}\n${error.stderr?.toString() || error.message}`);
  }
}
console.log(`${files.length - failed}/${files.length} fichiers JavaScript valides.`);
process.exit(failed ? 1 : 0);
