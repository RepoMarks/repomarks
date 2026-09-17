import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Config } from '../config.js';
import { GitRepo, type RepoStatus, type SyncOutcome } from '../git/repo.js';
import { LinkStore, normalizeTags } from '../store/store.js';
import type {
  Collection,
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
  gzipHtml,
  gunzipHtml,
  resolveArchiveAvailability,
  type ArchiveAvailability,
} from './archive.js';
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
      await this.repo.commit(created, 'init: 初始化数据仓库');
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
          await this.repo.commitAll('chore: 提交未保存的改动');
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
        previewImage: meta?.previewImage,
        contentType: meta?.contentType,
        notes: input.notes ?? '',
        pinned: input.pinned ?? false,
        archivedAt: null,
        archivePath: null,
        archiveStatus: 'none',
      };
      const changed = await this.store.addLink(record);
      await this.repo.commit(changed, `link: 添加 ${shorten(record.title)}`);
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
      if (patch.pinned !== undefined) updated.pinned = patch.pinned;
      updated.updatedAt = new Date().toISOString();

      const changed = await this.store.putLink(updated);
      await this.repo.commit(changed, `link: 更新 ${shorten(updated.title)}`);
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
      await this.repo.commit(changed, `link: 删除 ${shorten(link.title)}`);
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
      await this.repo.commit(changed, `link: 重新抓取 ${shorten(updated.title)}`);
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
      await this.repo.commit(changed, `archive: 开始存档 ${shorten(link.title)}`);
      this.schedulePush();
    });
    void this.runArchiveTask(id);
    return pending;
  }

  private async runArchiveTask(id: string): Promise<void> {
    const link = this.store.findById(id);
    if (!link) return;
    const relPath = `archives/${id}.html.gz`;
    try {
      const availability = this.archiveAvailability();
      const { html, engine } = await captureArchive(link.url, this.config, availability);
      const gzipped = await gzipHtml(html);

      await this.mutex.run(async () => {
        const current = this.store.findById(id);
        if (!current) return;
        await fsp.writeFile(this.store.abs(relPath), gzipped);
        const now = new Date().toISOString();
        const updated: LinkRecord = {
          ...current,
          archivedAt: now,
          archivePath: relPath,
          archiveEngine: engine,
          archiveStatus: 'ok',
          archiveError: null,
          archiveSize: gzipped.length,
          updatedAt: now,
        };
        const changed = await this.store.putLink(updated);
        await this.repo.commit([...changed, relPath], `archive: ${engine} 存档 ${shorten(current.title)}`);
        this.schedulePush();
      });
      logger.info(`存档完成 ${link.url} (${engine}, ${Math.round(gzipped.length / 1024)} KB)`);
    } catch (err) {
      const message = (err as Error).message.slice(0, 1000);
      logger.warn(`存档失败 ${link.url}: ${message}`);

      // 存档内容已落盘、仅提交失败时，重试提交而不是标记失败
      const settled = this.store.findById(id);
      if (settled?.archiveStatus === 'ok' && fs.existsSync(this.store.abs(relPath))) {
        try {
          await this.mutex.run(async () => {
            const changed = await this.store.putLink({
              ...settled,
              updatedAt: new Date().toISOString(),
            });
            await this.repo.commit(
              [...changed, relPath],
              `archive: ${settled.archiveEngine ?? ''} 存档 ${shorten(settled.title)}`
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
          await this.repo.commit(changed, `archive: 失败 ${shorten(current.title)}`);
          this.schedulePush();
        })
        .catch((writeErr) => logger.error('写入存档失败状态出错', (writeErr as Error).message));
    }
  }

  async readArchive(id: string): Promise<string> {
    const link = this.requireLink(id);
    if (!link.archivePath) throw new HttpError(404, '该链接还没有存档');
    const buffer = await fsp.readFile(this.store.abs(link.archivePath));
    return gunzipHtml(buffer);
  }

  // ---------------------------------------------------------------- 收藏夹

  async createCollection(input: { name: string; color?: string; parentId?: string | null }): Promise<Collection> {
    const name = input.name?.trim();
    if (!name) throw new HttpError(400, '收藏夹名称不能为空');
    this.requireCollection(input.parentId);
    return this.mutex.run(async () => {
      const now = new Date().toISOString();
      const collection: Collection = {
        id: ulid(),
        name: name.slice(0, 200),
        color: input.color?.trim() || pickColor(name),
        parentId: input.parentId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.store.collections.set(collection.id, collection);
      const changed = await this.store.saveCollections();
      await this.repo.commit(changed, `collection: 新建 ${shorten(name)}`);
      this.schedulePush();
      return collection;
    });
  }

  async updateCollection(
    id: string,
    patch: { name?: string; color?: string; parentId?: string | null }
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
      this.store.collections.set(id, updated);
      const changed = await this.store.saveCollections();
      await this.repo.commit(changed, `collection: 更新 ${shorten(updated.name)}`);
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

      await this.repo.commit([...paths], `collection: 删除 ${shorten(collection.name)}`);
      this.schedulePush();
    });
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
        await this.repo.commit([...paths], `import: 导入 ${records.length} 条链接`);
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
      generator: 'gitmarks',
      exportedAt: new Date().toISOString(),
      collections: [...this.store.collections.values()],
      links: [...this.store.links.values()],
    };
  }
}
