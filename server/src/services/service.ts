import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.js';
import { GitRepo, type RepoStatus, type SyncOutcome } from '../git/repo.js';
import { LinkStore, normalizeTags } from '../store/store.js';
import type {
  ApiKeyRecord,
  Collection,
  Highlight,
  ImportSummary,
  LinkInput,
  LinkRecord,
  SearchQuery,
  SearchResult,
} from '../store/types.js';
import { ulid } from '../util/ulid.js';
import { HttpError, Mutex } from '../util/misc.js';
import {
  assertAllowedUrl,
  fetchMetadata,
  normalizeUrl,
  type FetchedMetadata,
} from './metadata.js';
import {
  captureArchive,
  capturePdf,
  captureScreenshot,
  gzipHtml,
  gunzipHtml,
  resolveArchiveAvailability,
  sendToWayback,
  type ArchiveAvailability,
} from './archive.js';
import { extractReadable } from './readable.js';
import { parseJsonImport, parseNetscapeBookmarks, type ImportedEntry } from './importer.js';
import { logger } from '../logger.js';

export interface SyncState {
  syncing: boolean;
  lastSyncAt: string | null;
  lastPushedAt: string | null;
  lastPulledAt: string | null;
  lastError: string | null;
  pendingPush: boolean;
}

const PALETTE = ['#5b8def', '#2fb37e', '#e8a33d', '#d95c7a', '#9b6ee0', '#29a4b8', '#c96f3c', '#7a8b3f'];

function shorten(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function pickColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomSlug(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  return out;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class DataService {
  readonly store: LinkStore;
  readonly repo: GitRepo;
  readonly syncState: SyncState = {
    syncing: false,
    lastSyncAt: null,
    lastPushedAt: null,
    lastPulledAt: null,
    lastError: null,
    pendingPush: false,
  };

  private mutex = new Mutex();
  private pushTimer: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  constructor(private config: Config) {
    this.store = new LinkStore(config.dataDir, config.shardSize);
    this.repo = new GitRepo(
      config.dataDir,
      config.repoUrl,
      config.gitBranch,
      config.authorName,
      config.authorEmail,
      config.gitToken,
      config.gitUsername,
      config.gitSshKey
    );
  }

  async init(): Promise<void> {
    await this.repo.init();
    const created = await this.store.load();
    if (created.length > 0) {
      await this.repo.commit(created, 'init: initialize data repository');
    }
    try {
      const outcome = await this.runSync();
      if (outcome.pulled) logger.info('启动时已拉取远端最新数据');
    } catch (err) {
      logger.warn(`启动同步失败（稍后会自动重试）: ${(err as Error).message}`);
    }
  }

  archiveAvailability(): ArchiveAvailability {
    return resolveArchiveAvailability(this.config);
  }

  assertUrlAllowed(url: string): void {
    assertAllowedUrl(url, this.config.allowPrivateUrls);
  }

  async status(): Promise<{
    repo: RepoStatus;
    sync: SyncState;
    archive: ArchiveAvailability;
    ai: { enabled: boolean; model: string | null };
    stats: ReturnType<LinkStore['stats']>;
    warnings: string[];
    uptimeSeconds: number;
    node: string;
  }> {
    const repo = await this.repo.status();
    return {
      repo,
      sync: this.syncState,
      archive: this.archiveAvailability(),
      ai: { enabled: this.aiEnabled, model: this.config.aiModel || null },
      stats: this.store.stats(),
      warnings: this.store.warnings.slice(0, 50),
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
      node: process.version,
    };
  }

  async runSync(): Promise<SyncOutcome> {
    return this.mutex.run(async () => {
      this.syncState.syncing = true;
      try {
        if (await this.repo.isDirty()) {
          await this.repo.commitAll('chore: commit pending changes');
        }
        const outcome = await this.repo.sync();
        if (outcome.changed) {
          await this.store.load();
        }
        const now = new Date().toISOString();
        this.syncState.lastSyncAt = now;
        if (outcome.pushed) this.syncState.lastPushedAt = now;
        if (outcome.pulled) this.syncState.lastPulledAt = now;
        this.syncState.pendingPush = false;
        this.syncState.lastError = null;
        return outcome;
      } catch (err) {
        this.syncState.lastError = (err as Error).message;
        this.syncState.pendingPush = true;
        throw err;
      } finally {
        this.syncState.syncing = false;
      }
    });
  }

  private schedulePush(delayMs = 1500): void {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.runSync().catch((err) => logger.warn(`后台推送失败: ${(err as Error).message}`));
    }, delayMs);
    this.pushTimer.unref?.();
  }

  // ---------------------------------------------------------------- 链接

  search(query: SearchQuery): SearchResult {
    return this.store.search(query);
  }

  requireLink(id: string): LinkRecord {
    const link = this.store.findById(id);
    if (!link) throw new HttpError(404, '链接不存在');
    return link;
  }

  listCollections(): Array<Collection & { linkCount: number }> {
    const counts = this.store.collectionCounts();
    return [...this.store.collections.values()]
      .map((collection) => ({ ...collection, linkCount: counts.get(collection.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  private requireCollection(id: string | null | undefined): void {
    if (id && !this.store.collections.has(id)) {
      throw new HttpError(400, '指定的收藏夹不存在');
    }
  }

  async addLink(input: LinkInput): Promise<LinkRecord> {
    const url = normalizeUrl(input.url ?? '');
    assertAllowedUrl(url, this.config.allowPrivateUrls);
    if (this.store.findByUrl(url)) throw new HttpError(409, '该链接已存在');
    this.requireCollection(input.collectionId);

    let meta: FetchedMetadata | undefined;
    if (input.fetchMetadata !== false) {
      try {
        meta = await fetchMetadata(url, this.config.fetchTimeoutMs);
      } catch (err) {
        logger.warn(`抓取元数据失败 ${url}: ${(err as Error).message}`);
        if (!input.title) throw err;
      }
    }

    return this.mutex.run(async () => {
      if (this.store.findByUrl(url)) throw new HttpError(409, '该链接已存在');
      this.requireCollection(input.collectionId);
      const now = new Date().toISOString();
      const record: LinkRecord = {
        id: ulid(),
        url,
        title: (input.title?.trim() || meta?.title || url).slice(0, 500),
        description: (input.description ?? meta?.description ?? '').slice(0, 2000),
        tags: normalizeTags(input.tags),
        collectionId: input.collectionId ?? null,
        createdAt: now,
        updatedAt: now,
        siteName: meta?.siteName ?? hostnameOf(url),
        favicon: meta?.favicon,
        icon: input.icon?.trim().slice(0, 2000) || null,
        previewImage: meta?.previewImage,
        contentType: meta?.contentType,
        notes: input.notes ?? '',
        pinned: input.pinned ?? false,
        archivedAt: null,
        archivePath: null,
        archiveStatus: 'none',
      };
      const changed = await this.store.addLink(record);
      await this.repo.commit(changed, `link: add ${shorten(record.title)}`);
      this.schedulePush();
      return record;
    });
  }

  async updateLink(id: string, patch: Partial<LinkInput>): Promise<LinkRecord> {
    return this.mutex.run(async () => {
      const current = this.store.findById(id);
      if (!current) throw new HttpError(404, '链接不存在');
      const updated: LinkRecord = { ...current };

      if (patch.url !== undefined) {
        const url = normalizeUrl(patch.url);
        assertAllowedUrl(url, this.config.allowPrivateUrls);
        const existing = this.store.findByUrl(url);
        if (existing && existing.id !== id) throw new HttpError(409, '该链接已存在');
        updated.url = url;
      }
      if (patch.title !== undefined) updated.title = patch.title.trim().slice(0, 500) || updated.url;
      if (patch.description !== undefined) updated.description = patch.description.slice(0, 2000);
      if (patch.tags !== undefined) updated.tags = normalizeTags(patch.tags);
      if (patch.collectionId !== undefined) {
        this.requireCollection(patch.collectionId);
        updated.collectionId = patch.collectionId ?? null;
      }
      if (patch.notes !== undefined) updated.notes = patch.notes.slice(0, 20000);
      if (patch.icon !== undefined) {
        updated.icon = patch.icon ? patch.icon.trim().slice(0, 2000) : null;
      }
      if (patch.pinned !== undefined) updated.pinned = patch.pinned;
      updated.updatedAt = new Date().toISOString();

      const changed = await this.store.putLink(updated);
      await this.repo.commit(changed, `link: update ${shorten(updated.title)}`);
      this.schedulePush();
      return updated;
    });
  }

  async deleteLink(id: string): Promise<void> {
    await this.mutex.run(async () => {
      const link = this.store.findById(id);
      if (!link) throw new HttpError(404, '链接不存在');
      const changed = await this.store.deleteLink(id);
      if (link.archivePath) {
        changed.push(...(await this.store.deleteArchiveFile(link.archivePath)));
      }
      await this.repo.commit(changed, `link: delete ${shorten(link.title)}`);
      this.schedulePush();
    });
  }

  async refetchLink(id: string): Promise<LinkRecord> {
    const link = this.requireLink(id);
    assertAllowedUrl(link.url, this.config.allowPrivateUrls);
    const meta = await fetchMetadata(link.url, this.config.fetchTimeoutMs);
    return this.mutex.run(async () => {
      const current = this.store.findById(id);
      if (!current) throw new HttpError(404, '链接不存在');
      const updated: LinkRecord = {
        ...current,
        title: meta.title || current.title,
        description: meta.description ?? current.description,
        siteName: meta.siteName ?? current.siteName,
        favicon: meta.favicon ?? current.favicon,
        previewImage: meta.previewImage ?? current.previewImage,
        updatedAt: new Date().toISOString(),
      };
      const changed = await this.store.putLink(updated);
      await this.repo.commit(changed, `link: refetch ${shorten(updated.title)}`);
      this.schedulePush();
      return updated;
    });
  }

  // ---------------------------------------------------------------- AI 标签

  get aiEnabled(): boolean {
    return Boolean(this.config.aiBaseUrl && this.config.aiModel);
  }

  async aiSuggest(
    id: string,
    apply = false
  ): Promise<{ tags: string[]; summary: string; applied: boolean }> {
    if (!this.aiEnabled) {
      throw new HttpError(400, '未配置 AI：请设置 AI_BASE_URL 与 AI_MODEL');
    }
    const link = this.requireLink(id);

    let excerpt = '';
    if (link.readablePath) {
      try {
        const gzipped = await fsp.readFile(this.store.abs(link.readablePath));
        excerpt = (await gunzipHtml(gzipped)).slice(0, 4000);
      } catch {
        /* 忽略，仅用元数据 */
      }
    }

    const prompt = [
      `Title: ${link.title}`,
      `URL: ${link.url}`,
      link.description ? `Description: ${link.description}` : '',
      excerpt ? `Content:\n${excerpt}` : '',
      '',
      'Task: suggest 3-6 short tags (same language as the content) and a one-sentence summary.',
      'Reply with JSON only, in this shape: {"tags": ["tag1", "tag2"], "summary": "..."}',
    ]
      .filter(Boolean)
      .join('\n');

    let response: Response;
    try {
      response = await fetch(`${this.config.aiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.aiApiKey ? { authorization: `Bearer ${this.config.aiApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.aiModel,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You organize bookmarks. Always answer with valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(this.config.aiTimeoutMs),
      });
    } catch (err) {
      throw new HttpError(502, `AI 请求失败: ${(err as Error).message}`);
    }
    if (!response.ok) {
      throw new HttpError(502, `AI 请求失败: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? '';
    let parsed: { tags?: unknown; summary?: unknown } = {};
    try {
      const cleaned = content
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new HttpError(502, 'AI 返回内容无法解析为 JSON');
    }

    const tags = normalizeTags(parsed.tags);
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1000) : '';

    let applied = false;
    if (apply && (tags.length > 0 || summary)) {
      await this.mutex.run(async () => {
        const current = this.store.findById(id);
        if (!current) return;
        const updated: LinkRecord = {
          ...current,
          tags: normalizeTags([...current.tags, ...tags]),
          description: current.description?.trim() ? current.description : summary,
          updatedAt: new Date().toISOString(),
        };
        const changed = await this.store.putLink(updated);
        await this.repo.commit(changed, `ai: suggest ${shorten(current.title)}`);
        this.schedulePush();
        applied = true;
      });
    }
    return { tags, summary, applied };
  }

  // ---------------------------------------------------------------- 批量操作

  async bulkUpdate(
    ids: string[],
    action: string,
    payload: { tags?: string[]; collectionId?: string | null } = {}
  ): Promise<{ updated: number; archived: number }> {
    const unique = [...new Set(ids)].filter((id) => this.store.links.has(id));
    if (unique.length === 0) throw new HttpError(400, '没有可操作的链接');
    if (unique.length > 1000) throw new HttpError(400, '单次最多操作 1000 条链接');

    if (action === 'archive') {
      const targets = unique.filter((id) => this.store.findById(id)?.archiveStatus !== 'pending');
      for (const id of targets) {
        await this.archiveLink(id);
      }
      return { updated: targets.length, archived: targets.length };
    }

    if (action === 'delete') {
      await this.mutex.run(async () => {
        const paths = new Set<string>();
        for (const id of unique) {
          const link = this.store.findById(id);
          if (!link) continue;
          for (const path of await this.store.deleteLink(id)) paths.add(path);
          for (const archivePath of [
            link.archivePath,
            link.readablePath,
            link.screenshotPath,
            link.pdfPath,
          ]) {
            if (!archivePath) continue;
            for (const path of await this.store.deleteArchiveFile(archivePath)) paths.add(path);
          }
        }
        await this.repo.commit([...paths], `bulk: delete ${unique.length} links`);
        this.schedulePush();
      });
      return { updated: unique.length, archived: 0 };
    }

    if (action === 'setCollection') {
      this.requireCollection(payload.collectionId);
    }
    if ((action === 'addTags' || action === 'removeTags') && !payload.tags) {
      throw new HttpError(400, '缺少标签参数');
    }

    await this.mutex.run(async () => {
      const now = new Date().toISOString();
      const records: LinkRecord[] = [];
      for (const id of unique) {
        const link = this.store.findById(id);
        if (!link) continue;
        const updated: LinkRecord = { ...link, updatedAt: now };
        switch (action) {
          case 'addTags':
            updated.tags = normalizeTags([...link.tags, ...(payload.tags ?? [])]);
            break;
          case 'removeTags': {
            const remove = new Set((payload.tags ?? []).map((tag) => tag.toLowerCase()));
            updated.tags = link.tags.filter((tag) => !remove.has(tag.toLowerCase()));
            break;
          }
          case 'setCollection':
            updated.collectionId = payload.collectionId ?? null;
            break;
          case 'pin':
            updated.pinned = true;
            break;
          case 'unpin':
            updated.pinned = false;
            break;
          default:
            throw new HttpError(400, `不支持的操作: ${action}`);
        }
        records.push(updated);
      }
      if (records.length === 0) return;
      const paths = await this.store.putLinksBulk(records);
      await this.repo.commit(paths, `bulk: ${action} ${records.length} links`);
      this.schedulePush();
    });
    return { updated: unique.length, archived: 0 };
  }

  // ---------------------------------------------------------------- 高亮与批注

  async addHighlight(
    id: string,
    input: { text: string; note?: string; color?: string }
  ): Promise<LinkRecord> {
    const text = input.text?.trim().slice(0, 5000);
    if (!text) throw new HttpError(400, '高亮内容不能为空');
    return this.mutex.run(async () => {
      const current = this.store.findById(id);
      if (!current) throw new HttpError(404, '链接不存在');
      const highlight: Highlight = {
        id: ulid(),
        text,
        note: input.note?.slice(0, 5000) ?? '',
        color: input.color?.slice(0, 20) || 'yellow',
        createdAt: new Date().toISOString(),
      };
      const updated: LinkRecord = {
        ...current,
        highlights: [...(current.highlights ?? []), highlight],
        updatedAt: new Date().toISOString(),
      };
      const changed = await this.store.putLink(updated);
      await this.repo.commit(changed, `highlight: add ${shorten(current.title)}`);
      this.schedulePush();
      return updated;
    });
  }

  async updateHighlight(
    id: string,
    highlightId: string,
    patch: { note?: string; color?: string; text?: string }
  ): Promise<LinkRecord> {
    return this.mutex.run(async () => {
      const current = this.store.findById(id);
      if (!current) throw new HttpError(404, '链接不存在');
      const highlights = current.highlights ?? [];
      if (!highlights.some((item) => item.id === highlightId)) {
        throw new HttpError(404, '高亮不存在');
      }
      const updated: LinkRecord = {
        ...current,
        highlights: highlights.map((item) =>
          item.id === highlightId
            ? {
                ...item,
                note: patch.note !== undefined ? patch.note.slice(0, 5000) : item.note,
                color: patch.color !== undefined ? patch.color.slice(0, 20) : item.color,
                text: patch.text !== undefined ? patch.text.trim().slice(0, 5000) : item.text,
              }
            : item
        ),
        updatedAt: new Date().toISOString(),
      };
      const changed = await this.store.putLink(updated);
      await this.repo.commit(changed, `highlight: update ${shorten(current.title)}`);
      this.schedulePush();
      return updated;
    });
  }

  async deleteHighlight(id: string, highlightId: string): Promise<LinkRecord> {
    return this.mutex.run(async () => {
      const current = this.store.findById(id);
      if (!current) throw new HttpError(404, '链接不存在');
      const updated: LinkRecord = {
        ...current,
        highlights: (current.highlights ?? []).filter((item) => item.id !== highlightId),
        updatedAt: new Date().toISOString(),
      };
      const changed = await this.store.putLink(updated);
      await this.repo.commit(changed, `highlight: delete ${shorten(current.title)}`);
      this.schedulePush();
      return updated;
    });
  }

  // ---------------------------------------------------------------- 存档

  async archiveLink(id: string): Promise<LinkRecord> {
    const link = this.requireLink(id);
    const availability = this.archiveAvailability();
    if (!availability.available) throw new HttpError(400, availability.reason ?? '存档功能不可用');
    assertAllowedUrl(link.url, this.config.allowPrivateUrls);

    const pending: LinkRecord = {
      ...link,
      archiveStatus: 'pending',
      archiveError: null,
      updatedAt: new Date().toISOString(),
    };
    await this.mutex.run(async () => {
      const changed = await this.store.putLink(pending);
      await this.repo.commit(changed, `archive: start ${shorten(link.title)}`);
      this.schedulePush();
    });
    void this.runArchiveTask(id);
    return pending;
  }

  private async runArchiveTask(id: string): Promise<void> {
    const link = this.store.findById(id);
    if (!link) return;
    const base = `archives/${id}`;
    const filePaths: Record<'html' | 'readable' | 'screenshot' | 'pdf', string> = {
      html: `${base}.html.gz`,
      readable: `${base}.txt.gz`,
      screenshot: `${base}.png`,
      pdf: `${base}.pdf`,
    };
    const written: string[] = [];
    const sizes: Partial<Record<'html' | 'readable' | 'screenshot' | 'pdf', number>> = {};
    const errors: Record<string, string> = {};
    let htmlEngine: 'singlefile' | 'basic' | null = null;
    let waybackUrl: string | null = null;

    const fail = (format: string, err: unknown): void => {
      errors[format] = (err as Error).message.slice(0, 300);
      logger.warn(`${format} 存档失败 ${link.url}: ${errors[format]}`);
    };

    try {
      const availability = this.archiveAvailability();
      const formats = new Set(availability.formats);

      if (formats.has('html')) {
        const { html, engine } = await captureArchive(link.url, this.config, availability);
        const gzipped = await gzipHtml(html);
        await fsp.writeFile(this.store.abs(filePaths.html), gzipped);
        sizes.html = gzipped.length;
        htmlEngine = engine;
        written.push(filePaths.html);
      }

      if (formats.has('readable')) {
        try {
          const readable = await extractReadable(link.url, this.config.fetchTimeoutMs);
          if (readable.text.length === 0) throw new Error('未提取到正文内容');
          const gzipped = await gzipHtml(readable.text);
          await fsp.writeFile(this.store.abs(filePaths.readable), gzipped);
          sizes.readable = gzipped.length;
          written.push(filePaths.readable);
        } catch (err) {
          fail('readable', err);
        }
      }

      if (formats.has('screenshot') || formats.has('pdf')) {
        if (availability.browserPath) {
          if (formats.has('screenshot')) {
            try {
              sizes.screenshot = await captureScreenshot(
                link.url,
                this.store.abs(filePaths.screenshot),
                availability.browserPath,
                this.config.archiveBrowserArgs,
                this.config.archiveTimeoutMs
              );
              written.push(filePaths.screenshot);
            } catch (err) {
              fail('screenshot', err);
            }
          }
          if (formats.has('pdf')) {
            try {
              sizes.pdf = await capturePdf(
                link.url,
                this.store.abs(filePaths.pdf),
                availability.browserPath,
                this.config.archiveBrowserArgs,
                this.config.archiveTimeoutMs
              );
              written.push(filePaths.pdf);
            } catch (err) {
              fail('pdf', err);
            }
          }
        } else {
          const reason = '未找到 Chrome/Chromium，无法生成截图/PDF';
          if (formats.has('screenshot')) errors.screenshot = reason;
          if (formats.has('pdf')) errors.pdf = reason;
        }
      }

      if (formats.has('wayback')) {
        waybackUrl = await sendToWayback(link.url, this.config.archiveTimeoutMs);
        if (!waybackUrl) errors.wayback = 'Wayback Machine 提交失败';
      }

      if (written.length === 0) {
        throw new Error(Object.values(errors).join('；') || '没有生成任何存档格式');
      }

      const summary = Object.keys(sizes).join('+') || 'none';
      await this.mutex.run(async () => {
        const current = this.store.findById(id);
        if (!current) return;
        const now = new Date().toISOString();
        const updated: LinkRecord = {
          ...current,
          archivedAt: now,
          archiveStatus: 'ok',
          archiveError: null,
          archivePath: sizes.html !== undefined ? filePaths.html : (current.archivePath ?? null),
          archiveSize: sizes.html ?? current.archiveSize ?? null,
          archiveEngine: htmlEngine ?? current.archiveEngine ?? null,
          readablePath:
            sizes.readable !== undefined ? filePaths.readable : (current.readablePath ?? null),
          readableSize: sizes.readable ?? current.readableSize ?? null,
          screenshotPath:
            sizes.screenshot !== undefined
              ? filePaths.screenshot
              : (current.screenshotPath ?? null),
          screenshotSize: sizes.screenshot ?? current.screenshotSize ?? null,
          pdfPath: sizes.pdf !== undefined ? filePaths.pdf : (current.pdfPath ?? null),
          pdfSize: sizes.pdf ?? current.pdfSize ?? null,
          waybackUrl: waybackUrl ?? current.waybackUrl ?? null,
          waybackAt: waybackUrl ? now : (current.waybackAt ?? null),
          formatErrors: Object.keys(errors).length > 0 ? errors : null,
          updatedAt: now,
        };
        const changed = await this.store.putLink(updated);
        await this.repo.commit(
          [...changed, ...written],
          `archive: save ${shorten(current.title)} (${summary})`
        );
        this.schedulePush();
      });
      logger.info(`存档完成 ${link.url} [${summary}]`);
    } catch (err) {
      const message = (err as Error).message.slice(0, 1000);
      logger.warn(`存档失败 ${link.url}: ${message}`);

      // 存档内容已落盘、仅提交失败时，重试提交而不是标记失败
      const settled = this.store.findById(id);
      if (settled?.archiveStatus === 'ok' && written.length > 0) {
        try {
          await this.mutex.run(async () => {
            const changed = await this.store.putLink({
              ...settled,
              updatedAt: new Date().toISOString(),
            });
            await this.repo.commit(
              [...changed, ...written],
              `archive: save ${shorten(settled.title)}`
            );
            this.schedulePush();
          });
          logger.info(`存档内容已保留，提交重试成功 ${link.url}`);
          return;
        } catch (retryErr) {
          logger.warn(`存档提交重试失败: ${(retryErr as Error).message}`);
        }
      }

      await this.mutex
        .run(async () => {
          const current = this.store.findById(id);
          if (!current) return;
          const updated: LinkRecord = {
            ...current,
            archiveStatus: 'failed',
            archiveError: message,
            updatedAt: new Date().toISOString(),
          };
          const changed = await this.store.putLink(updated);
          await this.repo.commit(changed, `archive: failed ${shorten(current.title)}`);
          this.schedulePush();
        })
        .catch((writeErr) => logger.error('写入存档失败状态出错', (writeErr as Error).message));
    }
  }

  async readArchive(id: string): Promise<string> {
    const { data } = await this.readArchiveFormat(id, 'html');
    return data.toString('utf8');
  }

  async readArchiveFormat(
    id: string,
    format: 'html' | 'readable' | 'screenshot' | 'pdf'
  ): Promise<{ data: Buffer; contentType: string }> {
    const link = this.requireLink(id);
    const table = {
      html: { path: link.archivePath, type: 'text/html; charset=utf-8', gzipped: true },
      readable: { path: link.readablePath, type: 'text/plain; charset=utf-8', gzipped: true },
      screenshot: { path: link.screenshotPath, type: 'image/png', gzipped: false },
      pdf: { path: link.pdfPath, type: 'application/pdf', gzipped: false },
    } as const;
    const entry = table[format];
    if (!entry || !entry.path) {
      throw new HttpError(404, `该链接没有 ${format} 格式的存档`);
    }
    const buffer = await fsp.readFile(this.store.abs(entry.path));
    return {
      data: entry.gzipped ? Buffer.from(await gunzipHtml(buffer)) : buffer,
      contentType: entry.type,
    };
  }

  // ---------------------------------------------------------------- 收藏夹

  async createCollection(input: {
    name: string;
    color?: string;
    icon?: string;
    parentId?: string | null;
  }): Promise<Collection> {
    const name = input.name?.trim();
    if (!name) throw new HttpError(400, '收藏夹名称不能为空');
    this.requireCollection(input.parentId);
    return this.mutex.run(async () => {
      const now = new Date().toISOString();
      const collection: Collection = {
        id: ulid(),
        name: name.slice(0, 200),
        color: input.color?.trim() || pickColor(name),
        icon: input.icon?.trim().slice(0, 2000) || '',
        parentId: input.parentId ?? null,
        isPublic: false,
        slug: '',
        description: '',
        createdAt: now,
        updatedAt: now,
      };
      this.store.collections.set(collection.id, collection);
      const changed = await this.store.saveCollections();
      await this.repo.commit(changed, `collection: create ${shorten(name)}`);
      this.schedulePush();
      return collection;
    });
  }

  async updateCollection(
    id: string,
    patch: {
      name?: string;
      color?: string;
      icon?: string;
      parentId?: string | null;
      isPublic?: boolean;
      description?: string;
    }
  ): Promise<Collection> {
    return this.mutex.run(async () => {
      const current = this.store.collections.get(id);
      if (!current) throw new HttpError(404, '收藏夹不存在');
      const updated: Collection = { ...current, updatedAt: new Date().toISOString() };
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new HttpError(400, '收藏夹名称不能为空');
        updated.name = name.slice(0, 200);
      }
      if (patch.color !== undefined) updated.color = patch.color.trim();
      if (patch.icon !== undefined) updated.icon = patch.icon.trim().slice(0, 2000);
      if (patch.parentId !== undefined) {
        if (patch.parentId === id) throw new HttpError(400, '收藏夹不能作为自己的上级');
        this.requireCollection(patch.parentId);
        let cursor: string | null | undefined = patch.parentId;
        while (cursor) {
          const parent = this.store.collections.get(cursor);
          if (!parent) break;
          if (parent.parentId === id) throw new HttpError(400, '不能移动到自己的子收藏夹中');
          cursor = parent.parentId;
        }
        updated.parentId = patch.parentId ?? null;
      }
      if (patch.isPublic !== undefined) {
        updated.isPublic = patch.isPublic;
        if (patch.isPublic && !updated.slug) updated.slug = randomSlug();
      }
      if (patch.description !== undefined) {
        updated.description = patch.description.slice(0, 1000);
      }
      this.store.collections.set(id, updated);
      const changed = await this.store.saveCollections();
      await this.repo.commit(changed, `collection: update ${shorten(updated.name)}`);
      this.schedulePush();
      return updated;
    });
  }

  async deleteCollection(id: string): Promise<void> {
    await this.mutex.run(async () => {
      const collection = this.store.collections.get(id);
      if (!collection) throw new HttpError(404, '收藏夹不存在');
      const now = new Date().toISOString();
      const paths = new Set<string>();

      for (const child of [...this.store.collections.values()]) {
        if (child.parentId === id) {
          this.store.collections.set(child.id, { ...child, parentId: null, updatedAt: now });
        }
      }
      this.store.collections.delete(id);
      for (const path of await this.store.saveCollections()) paths.add(path);

      const affected = [...this.store.links.values()].filter((link) => link.collectionId === id);
      if (affected.length > 0) {
        const updated = affected.map((link) => ({ ...link, collectionId: null, updatedAt: now }));
        for (const path of await this.store.putLinksBulk(updated)) paths.add(path);
      }

      await this.repo.commit([...paths], `collection: delete ${shorten(collection.name)}`);
      this.schedulePush();
    });
  }

  // ---------------------------------------------------------------- API 密钥

  listApiKeys(): Array<Omit<ApiKeyRecord, 'hash'>> {
    return [...this.store.apiKeys.values()]
      .map(({ hash: _hash, ...rest }) => rest)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createApiKey(label: string): Promise<{ key: string; record: Omit<ApiKeyRecord, 'hash'> }> {
    const name = label?.trim().slice(0, 100) || 'API key';
    const token = `rm_${randomSlug(32)}`;
    const record: ApiKeyRecord = {
      id: ulid(),
      label: name,
      hash: hashToken(token),
      prefix: token.slice(0, 10),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    const { hash: _hash, ...publicRecord } = record;
    await this.mutex.run(async () => {
      this.store.apiKeys.set(record.id, record);
      const changed = await this.store.saveApiKeys();
      await this.repo.commit(changed, `apikey: create ${name}`);
      this.schedulePush();
    });
    return { key: token, record: publicRecord };
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.mutex.run(async () => {
      const record = this.store.apiKeys.get(id);
      if (!record) throw new HttpError(404, '密钥不存在');
      this.store.apiKeys.delete(id);
      const changed = await this.store.saveApiKeys();
      await this.repo.commit(changed, `apikey: revoke ${record.label}`);
      this.schedulePush();
    });
  }

  /** 校验 Bearer / X-API-Key 令牌；lastUsedAt 每天最多持久化一次 */
  authenticateApiKey(token: string): boolean {
    if (!token) return false;
    const hash = hashToken(token);
    const hashBuffer = Buffer.from(hash, 'utf8');
    for (const record of this.store.apiKeys.values()) {
      const stored = Buffer.from(record.hash, 'utf8');
      if (stored.length !== hashBuffer.length) continue;
      if (!timingSafeEqual(stored, hashBuffer)) continue;
      const now = Date.now();
      const lastUsed = record.lastUsedAt ? Date.parse(record.lastUsedAt) : 0;
      if (!lastUsed || Number.isNaN(lastUsed) || now - lastUsed > 24 * 60 * 60 * 1000) {
        record.lastUsedAt = new Date(now).toISOString();
        void this.mutex
          .run(async () => {
            const changed = await this.store.saveApiKeys();
            await this.repo.commit(changed, `apikey: usage ${record.label}`);
            this.schedulePush();
          })
          .catch(() => undefined);
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- 公开分享

  /** 按 slug 查找已公开的收藏夹（包含子收藏夹里的链接） */
  findPublicCollection(slug: string): { collection: Collection; links: LinkRecord[] } | null {
    if (!slug) return null;
    const collection = [...this.store.collections.values()].find(
      (item) => item.isPublic && item.slug === slug
    );
    if (!collection) return null;
    const ids = new Set<string>();
    const collect = (id: string): void => {
      ids.add(id);
      for (const child of this.store.collections.values()) {
        if (child.parentId === id) collect(child.id);
      }
    };
    collect(collection.id);
    const links = [...this.store.links.values()]
      .filter((link) => link.collectionId && ids.has(link.collectionId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { collection, links };
  }

  findPublicLink(slug: string, linkId: string): LinkRecord | null {
    return this.findPublicCollection(slug)?.links.find((link) => link.id === linkId) ?? null;
  }

  // ---------------------------------------------------------------- 导入导出

  async importBookmarks(payload: {
    html?: string;
    json?: string;
    defaultCollectionId?: string | null;
  }): Promise<ImportSummary> {
    let entries: ImportedEntry[];
    if (payload.html) {
      entries = parseNetscapeBookmarks(payload.html).entries;
    } else if (payload.json) {
      entries = parseJsonImport(payload.json).entries;
    } else {
      throw new HttpError(400, '请提供书签内容（html 或 json）');
    }
    if (entries.length > 50_000) {
      throw new HttpError(400, '单次导入不能超过 50000 条链接');
    }
    const defaultCollectionId = payload.defaultCollectionId ?? null;
    this.requireCollection(defaultCollectionId);

    return this.mutex.run(async () => {
      const collectionCache = new Map<string, string>();
      let collectionsCreated = 0;

      const ensureCollection = (pathParts: string[]): string | null => {
        let parentId = defaultCollectionId;
        for (const rawName of pathParts) {
          const name = rawName.slice(0, 200);
          const key = `${parentId ?? ''}\u0000${name.toLowerCase()}`;
          let found = collectionCache.get(key);
          if (!found) {
            const existing = [...this.store.collections.values()].find(
              (c) => (c.parentId ?? null) === parentId && c.name.toLowerCase() === name.toLowerCase()
            );
            if (existing) {
              found = existing.id;
            } else {
              const now = new Date().toISOString();
              const collection: Collection = {
                id: ulid(),
                name,
                color: pickColor(name),
                parentId,
                createdAt: now,
                updatedAt: now,
              };
              this.store.collections.set(collection.id, collection);
              collectionsCreated++;
              found = collection.id;
            }
            collectionCache.set(key, found);
          }
          parentId = found;
        }
        return parentId;
      };

      const now = new Date().toISOString();
      const seen = new Set<string>();
      const records: LinkRecord[] = [];
      let skipped = 0;

      for (const entry of entries) {
        let url: string;
        try {
          url = normalizeUrl(entry.url);
        } catch {
          skipped++;
          continue;
        }
        if (seen.has(url) || this.store.findByUrl(url)) {
          skipped++;
          continue;
        }
        seen.add(url);
        const collectionId = entry.folder.length > 0 ? ensureCollection(entry.folder) : defaultCollectionId;
        const createdAt = entry.createdAt ?? now;
        records.push({
          id: ulid(),
          url,
          title: entry.title.slice(0, 500) || url,
          description: '',
          tags: normalizeTags(entry.tags),
          collectionId,
          createdAt,
          updatedAt: createdAt,
          siteName: hostnameOf(url),
          favicon: `https://${hostnameOf(url)}/favicon.ico`,
          archivedAt: null,
          archivePath: null,
          archiveStatus: 'none',
        });
      }

      const paths = new Set<string>();
      if (collectionsCreated > 0) {
        for (const path of await this.store.saveCollections()) paths.add(path);
      }
      if (records.length > 0) {
        for (const path of await this.store.addLinksBulk(records)) paths.add(path);
      }
      if (paths.size > 0) {
        await this.repo.commit([...paths], `import: add ${records.length} links`);
        this.schedulePush();
      }
      return { linksAdded: records.length, linksSkipped: skipped, collectionsCreated };
    });
  }

  async exportData(): Promise<{
    generator: string;
    exportedAt: string;
    collections: Collection[];
    links: LinkRecord[];
  }> {
    return {
      generator: 'repomarks',
      exportedAt: new Date().toISOString(),
      collections: [...this.store.collections.values()],
      links: [...this.store.links.values()],
    };
  }
}
