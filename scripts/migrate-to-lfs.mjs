#!/usr/bin/env node
// 把已有数据仓库中 archives/ 与 files/ 的历史迁移到 Git LFS。
// 用法: node scripts/migrate-to-lfs.mjs <data-dir> [--push]
// 注意: 会重写历史，执行前请停止服务并确保工作区干净；--push 会强制推送。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.argv[2];
const shouldPush = process.argv.includes('--push');
if (!dataDir) {
  console.error('用法: node scripts/migrate-to-lfs.mjs <data-dir> [--push]');
  process.exit(1);
}

const run = (args) => {
  console.log(`> git ${args.join(' ')}`);
  execFileSync('git', args, { cwd: dataDir, stdio: 'inherit' });
};

const LFS_RULES = [
  'archives/** filter=lfs diff=lfs merge=lfs -text',
  'files/** filter=lfs diff=lfs merge=lfs -text',
];

run(['lfs', 'install', '--local']);

const attributePath = path.join(dataDir, '.gitattributes');
let existing = '';
try {
  existing = fs.readFileSync(attributePath, 'utf8');
} catch {
  /* 尚无 .gitattributes */
}
const lines = existing.split('\n').map((line) => line.trim());
const missing = LFS_RULES.filter((rule) => !lines.includes(rule));
if (missing.length > 0) {
  fs.writeFileSync(
    attributePath,
    `${existing.trim() ? `${existing.trimEnd()}\n` : ''}${missing.join('\n')}\n`,
    'utf8'
  );
  run(['add', '.gitattributes']);
  try {
    run(['commit', '-m', 'chore: track archives and files with git lfs']);
  } catch {
    console.log('没有需要提交的 .gitattributes 变更');
  }
}

run(['lfs', 'migrate', 'import', '--include=archives/**,files/**', '--everything']);

if (shouldPush) {
  run(['push', '--force-with-lease', 'origin', 'HEAD']);
  console.log('迁移并强制推送完成：历史已重写，其他克隆需要重新 clone。');
} else {
  console.log('迁移完成（仅本地）。确认无误后运行: node scripts/migrate-to-lfs.mjs <data-dir> --push');
}
