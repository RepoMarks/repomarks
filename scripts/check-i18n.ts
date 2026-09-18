import fs from 'node:fs';
import path from 'node:path';
import { EN_TRANSLATIONS } from '../web/src/i18n';

const root = 'web/src';
const files: string[] = [];
const walk = (dir: string): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !full.endsWith('i18n.tsx')) files.push(full);
  }
};
walk(root);

const used = new Set<string>();
const pattern = /t\(\s*'((?:[^'\\]|\\.)*)'/gs;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(pattern)) {
    const key = match[1].replace(/\\'/g, "'").replace(/\\n/g, '\n');
    if (/[\u4e00-\u9fff]/.test(key)) used.add(key);
  }
}

const missing = [...used].filter((key) => !(key in EN_TRANSLATIONS));
const unused = Object.keys(EN_TRANSLATIONS).filter((key) => !used.has(key));

console.log(`keys used: ${used.size}`);
console.log(`translated: ${Object.keys(EN_TRANSLATIONS).length}`);
if (missing.length > 0) {
  console.log(`\nMISSING TRANSLATIONS (${missing.length}):`);
  for (const key of missing) console.log(`  ${key}`);
}
if (unused.length > 0) {
  console.log(`\nunused entries (${unused.length}, harmless):`);
  for (const key of unused) console.log(`  ${key}`);
}
if (missing.length > 0) process.exit(1);
