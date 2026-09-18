import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

const rootDir = path.resolve(process.cwd());
dotenv.config({ path: path.join(rootDir, '.env') });

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export type ArchiveEngine = 'auto' | 'singlefile' | 'basic' | 'off';
export type ArchiveFormat = 'html' | 'readable' | 'screenshot' | 'pdf' | 'wayback';
export type LfsMode = 'auto' | 'true' | 'false';

const ARCHIVE_FORMAT_VALUES: ArchiveFormat[] = ['html', 'readable', 'screenshot', 'pdf', 'wayback'];

export interface Config {
  repoUrl: string;
  gitToken: string;
  gitUsername: string;
  gitBranch: string;
  gitSshKey: string;
  gitLfs: LfsMode;
  dataDir: string;
  port: number;
  host: string;
  basePath: string;
  authPassword: string;
  sessionSecret: string;
  shardSize: number;
  syncIntervalMs: number;
  fetchTimeoutMs: number;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiTimeoutMs: number;
  archiveEngine: ArchiveEngine;
  archiveFormats: ArchiveFormat[];
  archiveWayback: boolean;
  refreshArchiveDays: number;
  refreshArchiveLimit: number;
  feedSyncIntervalHours: number;
  fulltextIndex: boolean;
  fulltextMaxChars: number;
  archiveBrowserPath: string;
  archiveBrowserArgs: string[];
  archiveTimeoutMs: number;
  allowPrivateUrls: boolean;
  authorName: string;
  authorEmail: string;
}

export function loadConfig(): Config {
  const repoUrl = str('REPO_URL');
  if (!repoUrl) {
    console.error(
      '\n[repomarks] 缺少 REPO_URL。请复制 .env.example 为 .env 并填写数据仓库地址。\n'
    );
    process.exit(1);
  }
  const authPassword = str('AUTH_PASSWORD');
  if (!authPassword) {
    console.warn('[repomarks] 警告: 未设置 AUTH_PASSWORD，服务将不启用登录保护。');
  }
  const dataDir = path.resolve(rootDir, str('DATA_DIR', './data'));
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  return {
    repoUrl,
    gitToken: str('GIT_TOKEN'),
    gitUsername: str('GIT_USERNAME', 'x-access-token'),
    gitBranch: str('GIT_BRANCH', 'main'),
    gitSshKey: str('GIT_SSH_KEY'),
    gitLfs: (() => {
      const value = str('GIT_LFS', 'auto').toLowerCase();
      return value === 'true' || value === 'false' ? (value as LfsMode) : 'auto';
    })(),
    dataDir,
    port: num('PORT', 3000),
    host: str('HOST', '0.0.0.0'),
    basePath: (() => {
      const raw = str('BASE_PATH').trim();
      if (!raw || raw === '/') return '';
      const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
      return withSlash.replace(/\/+$/, '');
    })(),
    authPassword,
    sessionSecret:
      str('SESSION_SECRET') ||
      crypto.createHash('sha256').update(`repomarks:${authPassword}:${repoUrl}`).digest('hex'),
    shardSize: Math.max(100, num('SHARD_SIZE', 1000)),
    syncIntervalMs: Math.max(0, num('SYNC_INTERVAL', 60)) * 1000,
    fetchTimeoutMs: num('FETCH_TIMEOUT', 15000),
    aiBaseUrl: str('AI_BASE_URL'),
    aiApiKey: str('AI_API_KEY'),
    aiModel: str('AI_MODEL'),
    aiTimeoutMs: num('AI_TIMEOUT', 30000),
    archiveEngine: (str('ARCHIVE_ENGINE', 'auto') as ArchiveEngine) ?? 'auto',
    archiveFormats: str('ARCHIVE_FORMATS', 'html,readable,screenshot,pdf')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is ArchiveFormat =>
        ARCHIVE_FORMAT_VALUES.includes(value as ArchiveFormat)
      ),
    archiveWayback: bool('ARCHIVE_WAYBACK', false),
    refreshArchiveDays: Math.max(0, num('REFRESH_ARCHIVE_DAYS', 0)),
    refreshArchiveLimit: Math.max(1, num('REFRESH_ARCHIVE_LIMIT', 5)),
    feedSyncIntervalHours: Math.max(0, num('FEED_SYNC_INTERVAL_HOURS', 0)),
    fulltextIndex: bool('FULLTEXT_INDEX', true),
    fulltextMaxChars: Math.max(500, num('FULLTEXT_MAX_CHARS', 2000)),
    archiveBrowserPath: str('ARCHIVE_BROWSER_PATH'),
    archiveBrowserArgs: str('ARCHIVE_BROWSER_ARGS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    archiveTimeoutMs: num('ARCHIVE_TIMEOUT', 90000),
    allowPrivateUrls: bool('ALLOW_PRIVATE_URLS', false),
    authorName: str('GIT_AUTHOR_NAME', 'RepoMarks'),
    authorEmail: str('GIT_AUTHOR_EMAIL', 'repomarks@localhost'),
  };
}
