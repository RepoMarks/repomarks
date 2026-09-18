#!/usr/bin/env node
// 从数据仓库历史中彻底删除指定路径（例如某个链接的存档），并回收空间。
// 用法: node scripts/repo-slim.mjs <data-dir> --path=archives/<id>.html.gz [--path=...] [--push]
// 注意: 会重写历史；执行前请停止服务并做好备份；--push 会强制推送。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const dataDir = args[0];
const paths = args
  .filter((arg) => arg.startsWith('--path='))
  .map((arg) => arg.slice('--path='.length));
const shouldPush = args.includes('--push');

if (!dataDir || paths.length === 0) {
  console.error('用法: node scripts/repo-slim.mjs <data-dir> --path=<relative path> [--path=...] [--push]');
  process.exit(1);
}
if (!fs.existsSync(dataDir)) {
  console.error(`目录不存在: ${dataDir}`);
  process.exit(1);
}

const run = (command, commandArgs, options = {}) => {
  console.log(`> git ${commandArgs.join(' ')}`);
  execFileSync(command, commandArgs, { cwd: dataDir, stdio: 'inherit', ...options });
};

const rmCommand = paths.map((value) => `git rm -r --cached --ignore-unmatch '${value}'`).join(' && ');
run('git', [
  'filter-branch',
  '-f',
  '--prune-empty',
  '--index-filter',
  rmCommand,
  '--tag-name-filter',
  'cat',
  '--',
  '--all',
]);
run('git', ['for-each-ref', '--format=%(refname)', 'refs/original/'], {});
run('git', ['reflog', 'expire', '--expire=now', '--all']);
run('git', ['gc', '--prune=now', '--aggressive', '--quiet']);

if (shouldPush) {
  run('git', ['fetch', 'origin']);
  run('git', ['push', '--force-with-lease', 'origin', 'HEAD']);
  console.log('已强制推送（历史已重写，其他克隆需要重新 clone）。');
} else {
  console.log('本地历史已清理。确认无误后加 --push 推送到远端。');
}
