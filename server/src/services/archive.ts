import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { logger } from '../logger.js';
import { captureBasicArchive } from './basic-archive.js';
import type { Config } from '../config.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;

export type ResolvedArchiveEngine = 'singlefile' | 'basic' | 'off';

export interface ArchiveAvailability {
  engine: ResolvedArchiveEngine;
  available: boolean;
  browserPath?: string;
  reason?: string;
}

function findInPath(names: string[]): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export function resolveBrowserPath(configured: string): string | null {
  if (configured) {
    return fs.existsSync(configured) ? configured : null;
  }
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? '';
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
    const home = os.homedir();
    candidates.push(
      path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    );
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return findInPath([
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
    'microsoft-edge',
    'microsoft-edge-stable',
    'headless_shell',
  ]);
}

export function resolveSingleFileBin(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve('single-file-cli/single-file-node.js');
  } catch {
    return null;
  }
}

export function resolveArchiveAvailability(config: Config): ArchiveAvailability {
  if (config.archiveEngine === 'off') {
    return { engine: 'off', available: false, reason: '已在配置中关闭存档功能' };
  }
  const browserPath = resolveBrowserPath(config.archiveBrowserPath);
  const singleFileBin = resolveSingleFileBin();
  if (config.archiveEngine === 'basic') {
    return { engine: 'basic', available: true, browserPath: browserPath ?? undefined };
  }
  if (!singleFileBin) {
    return config.archiveEngine === 'singlefile'
      ? { engine: 'singlefile', available: false, reason: '未安装 single-file-cli' }
      : { engine: 'basic', available: true, reason: '未安装 single-file-cli，使用轻量存档' };
  }
  if (!browserPath) {
    return config.archiveEngine === 'singlefile'
      ? {
          engine: 'singlefile',
          available: false,
          reason: '未找到 Chrome/Chromium，可设置 ARCHIVE_BROWSER_PATH',
        }
      : { engine: 'basic', available: true, reason: '未找到 Chrome/Chromium，使用轻量存档' };
  }
  return { engine: 'singlefile', available: true, browserPath };
}

function captureSingleFile(
  url: string,
  browserPath: string,
  browserArgs: string[],
  timeoutMs: number
): Promise<string> {
  const bin = resolveSingleFileBin();
  if (!bin) return Promise.reject(new Error('未安装 single-file-cli'));
  const args = [
    bin,
    url,
    '--dump-content=true',
    `--browser-executable-path=${browserPath}`,
    `--browser-load-max-time=${timeoutMs}`,
    '--block-scripts=false',
    '--browser-bypass-csp=true',
    '--browser-wait-until=networkIdle',
    '--browser-wait-until-fallback=true',
  ];
  if (browserArgs.length > 0) {
    args.push(`--browser-args=${JSON.stringify(browserArgs)}`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true });
    const stdoutChunks: Buffer[] = [];
    let stdoutSize = 0;
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`存档超时（${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs + 30_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_ARCHIVE_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill('SIGKILL');
          reject(new Error('页面过大，超过存档大小限制'));
        }
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`single-file 退出码 ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`));
        return;
      }
      const html = Buffer.concat(stdoutChunks).toString('utf8').trim();
      if (!html.startsWith('<')) {
        reject(new Error(`single-file 未返回 HTML: ${stderr.trim().split('\n').slice(-3).join(' | ')}`));
        return;
      }
      resolve(html);
    });
  });
}

export async function captureArchive(
  url: string,
  config: Config,
  availability: ArchiveAvailability
): Promise<{ html: string; engine: 'singlefile' | 'basic' }> {
  if (availability.engine === 'off' || !availability.available) {
    throw new Error(availability.reason ?? '存档功能不可用');
  }
  if (availability.engine === 'singlefile' && availability.browserPath) {
    try {
      const html = await captureSingleFile(
        url,
        availability.browserPath,
        config.archiveBrowserArgs,
        config.archiveTimeoutMs
      );
      return { html, engine: 'singlefile' };
    } catch (err) {
      if (config.archiveEngine === 'singlefile') throw err;
      logger.warn(`single-file 存档失败，回退到轻量存档: ${(err as Error).message}`);
    }
  }
  const html = await captureBasicArchive(url, config.fetchTimeoutMs);
  return { html, engine: 'basic' };
}

export async function gzipHtml(html: string): Promise<Buffer> {
  return gzip(Buffer.from(html, 'utf8'), { level: 9 });
}

export async function gunzipHtml(buffer: Buffer): Promise<string> {
  return (await gunzip(buffer)).toString('utf8');
}
