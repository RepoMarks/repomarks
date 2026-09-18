import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ApiKeyRecord,
  Collection,
  LinkRecord,
  RepoMeta,
  SearchQuery,
  SearchResult,
} from './types.js';

const META_FILE = 'meta.json';
const COLLECTIONS_FILE = 'collections.json';
const API_KEYS_FILE = 'apikeys.json';
const LINKS_DIR = 'links';
const ARCHIVES_DIR = 'archives';
const NO_COLLECTION = '__none__';

interface ShardInfo {
  name: string;
  ids: string[];
}

export class LinkStore {
  readonly links = new Map<string, LinkRecord>();
  readonly collections = new Map<string, Collection>();
  readonly apiKeys = new Map<string, ApiKeyRecord>();
  warnings: string[] = [];

  private shards: ShardInfo[] = [];
  private linkShardIndex = new Map<string, string>();
  private searchText = new Map<string, string>();
  private searchTextLower = new Map<string, string>();
  private searchIndexLines = 0;

  constructor(
    private dir: string,
    private shardSize: number,
    private fulltextMaxChars = 2000
  ) {}

  get directory(): string {
    return this.dir;
  }

  abs(rel: string): string {
    return path.join(this.dir, rel);
  }

  // ---------------------------------------------------------------- 加载

  /** 从磁盘重建内存索引。返回新建的初始文件列表（用于首次提交） */
  async load(): Promise<string[]> {
    const created: string[] = [];
    await fsp.mkdir(path.join(this.dir, LINKS_DIR), { recursive: true });
    await fsp.mkdir(path.join(this.dir, ARCHIVES_DIR), { recursive: true });

    if (!fs.existsSync(this.abs(META_FILE))) {
      const meta: RepoMeta = {
        version: 1,
        generator: 'repomarks',
        createdAt: new Date().toISOString(),
      };
      await this.atomicWrite(META_FILE, JSON.stringify(meta, null, 2) + '\n');
      created.push(META_FILE);
    }
    if (!fs.existsSync(this.abs(COLLECTIONS_FILE))) {
      await this.atomicWrite(COLLECTIONS_FILE, '[]\n');
      created.push(COLLECTIONS_FILE);
    }

    this.links.clear();
    this.collections.clear();
    this.apiKeys.clear();
    this.shards = [];
    this.linkShardIndex.clear();
    this.warnings = [];

    await this.loadCollections();
    await this.loadApiKeys();
    await this.loadShards();
    await this.loadSearchIndex();
    return created;
  }

  private async loadSearchIndex(): Promise<void> {
    this.searchText.clear();
    this.searchTextLower.clear();
    this.searchIndexLines = 0;
    const file = path.join(this.dir, 'index', 'search.jsonl');
    if (!fs.existsSync(file)) return;
    const raw = await fsp.readFile(file, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      this.searchIndexLines++;
      try {
        const entry = JSON.parse(line) as { id?: string; text?: string };
        if (!entry.id) continue;
        if (!entry.text) {
          this.searchText.delete(entry.id);
          this.searchTextLower.delete(entry.id);
          continue;
        }
        this.searchText.set(entry.id, entry.text);
        this.searchTextLower.set(entry.id, entry.text.toLowerCase());
      } catch {
        /* 跳过损坏行 */
      }
    }
  }

  /** 写入/更新某条链接的正文索引；必要时压缩索引文件。返回变更文件路径 */
  async appendSearchText(id: string, text: string): Promise<string> {
    const rel = 'index/search.jsonl';
    const clipped = text.slice(0, this.fulltextMaxChars);
    if (clipped) {
      this.searchText.set(id, clipped);
      this.searchTextLower.set(id, clipped.toLowerCase());
    } else {
      this.searchText.delete(id);
      this.searchTextLower.delete(id);
    }
    if (this.searchIndexLines > this.searchText.size * 1.5 + 50) {
      await this.saveSearchIndex();
      return rel;
    }
    await fsp.mkdir(path.dirname(this.abs(rel)), { recursive: true });
    await fsp.appendFile(this.abs(rel), `${JSON.stringify({ id, text: clipped })}\n`, 'utf8');
    this.searchIndexLines++;
    return rel;
  }

  /** 索引压缩写盘 */
  async saveSearchIndex(): Promise<string[]> {
    const rel = 'index/search.jsonl';
    const lines = [...this.searchText.entries()].map(([id, text]) =>
      JSON.stringify({ id, text })
    );
    await this.atomicWrite(rel, lines.length > 0 ? `${lines.join('\n')}\n` : '');
    this.searchIndexLines = lines.length;
    return [rel];
  }

  hasSearchText(id: string): boolean {
    return this.searchTextLower.has(id);
  }

  /** 用给定内容整体替换全文索引（重建时使用） */
  async replaceSearchIndex(entries: Array<[string, string]>): Promise<string[]> {
    this.searchText.clear();
    this.searchTextLower.clear();
    for (const [id, text] of entries) {
      const clipped = text.slice(0, this.fulltextMaxChars);
      if (!clipped) continue;
      this.searchText.set(id, clipped);
      this.searchTextLower.set(id, clipped.toLowerCase());
    }
    return this.saveSearchIndex();
  }

  getSearchText(id: string): string | undefined {
    return this.searchText.get(id);
  }

  private async loadApiKeys(): Promise<void> {
    if (!fs.existsSync(this.abs(API_KEYS_FILE))) {
      return;
    }
    try {
      const raw = await fsp.readFile(this.abs(API_KEYS_FILE), 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('apikeys.json 不是数组');
      for (const item of parsed) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
        this.apiKeys.set(item.id, item as ApiKeyRecord);
      }
    } catch (err) {
      this.warnings.push(`apikeys.json 解析失败: ${(err as Error).message}`);
    }
  }

  async saveApiKeys(): Promise<string[]> {
    const list = [...this.apiKeys.values()];
    await this.atomicWrite(API_KEYS_FILE, JSON.stringify(list, null, 2) + '\n');
    return [API_KEYS_FILE];
  }

  private async loadCollections(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.abs(COLLECTIONS_FILE), 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('collections.json 不是数组');
      for (const item of parsed) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string') {
          this.warnings.push('collections.json: 跳过无效条目');
          continue;
        }
        this.collections.set(item.id, this.normalizeCollection(item));
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.warnings.push(`collections.json 解析失败: ${(err as Error).message}`);
      }
    }
  }

  private async loadShards(): Promise<void> {
    const dir = this.abs(LINKS_DIR);
    const files = (await fsp.readdir(dir))
      .filter((f) => f.endsWith('.jsonl'))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

    for (const file of files) {
      const shard: ShardInfo = { name: file, ids: [] };
      const raw = await fsp.readFile(path.join(dir, file), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as LinkRecord;
          if (!record || typeof record.id !== 'string' || !record.id) {
            this.warnings.push(`${file}: 跳过缺少 id 的记录`);
            continue;
          }
          const normalized = this.normalizeLink(record);
          this.links.set(normalized.id, normalized);
          this.linkShardIndex.set(normalized.id, file);
          shard.ids.push(normalized.id);
        } catch {
          this.warnings.push(`${file}: 跳过无法解析的行`);
        }
      }
      this.shards.push(shard);
    }
  }

  private normalizeLink(record: LinkRecord): LinkRecord {
    return {
      ...record,
      title: typeof record.title === 'string' && record.title.trim() ? record.title : record.url,
      description: typeof record.description === 'string' ? record.description : '',
      tags: this.normalizeTags(record.tags),
      collectionId: record.collectionId ?? null,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
      archiveStatus: record.archiveStatus ?? (record.archivedAt ? 'ok' : 'none'),
    };
  }

  private normalizeCollection(record: Collection): Collection {
    const now = new Date().toISOString();
    return {
      ...record,
      id: record.id,
      name: record.name || '未命名',
      color: record.color ?? '',
      parentId: record.parentId ?? null,
      isPublic: record.isPublic ?? false,
      slug: record.slug ?? '',
      description: record.description ?? '',
      createdAt: record.createdAt || now,
      updatedAt: record.updatedAt || record.createdAt || now,
    };
  }

  private normalizeTags(tags: unknown): string[] {
    return normalizeTags(tags);
  }

  // ---------------------------------------------------------------- 写入

  private async atomicWrite(rel: string, content: string): Promise<void> {
    const target = this.abs(rel);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp${process.pid}${Date.now()}`;
    await fsp.writeFile(tmp, content, 'utf8');
    await fsp.rename(tmp, target);
  }

  private lastShard(): ShardInfo | undefined {
    return this.shards[this.shards.length - 1];
  }

  private nextShardName(): string {
    const max = this.shards.reduce((acc, s) => {
      const n = Number.parseInt(s.name, 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, -1);
    return `${String(max + 1).padStart(4, '0')}.jsonl`;
  }

  private shardRel(name: string): string {
    return `${LINKS_DIR}/${name}`;
  }

  async addLink(record: LinkRecord): Promise<string[]> {
    let shard = this.lastShard();
    if (!shard || shard.ids.length >= this.shardSize) {
      shard = { name: this.nextShardName(), ids: [] };
      this.shards.push(shard);
    }
    await fsp.appendFile(this.abs(this.shardRel(shard.name)), JSON.stringify(record) + '\n', 'utf8');
    shard.ids.push(record.id);
    this.links.set(record.id, record);
    this.linkShardIndex.set(record.id, shard.name);
    return [this.shardRel(shard.name)];
  }

  /** 批量写入（导入场景），返回变更文件列表 */
  async addLinksBulk(records: LinkRecord[]): Promise<string[]> {
    const changed = new Set<string>();
    let index = 0;
    while (index < records.length) {
      let shard = this.lastShard();
      if (!shard || shard.ids.length >= this.shardSize) {
        shard = { name: this.nextShardName(), ids: [] };
        this.shards.push(shard);
      }
      const room = this.shardSize - shard.ids.length;
      const slice = records.slice(index, index + room);
      const lines = slice.map((r) => JSON.stringify(r)).join('\n') + '\n';
      const rel = this.shardRel(shard.name);
      await fsp.appendFile(this.abs(rel), lines, 'utf8');
      for (const record of slice) {
        shard.ids.push(record.id);
        this.links.set(record.id, record);
        this.linkShardIndex.set(record.id, shard.name);
      }
      changed.add(rel);
      index += slice.length;
    }
    return [...changed];
  }

  async putLinksBulk(records: LinkRecord[]): Promise<string[]> {
    const shards = new Set<string>();
    for (const record of records) {
      this.links.set(record.id, record);
      const shardName = this.linkShardIndex.get(record.id);
      if (shardName) shards.add(shardName);
    }
    for (const shardName of shards) {
      await this.rewriteShard(shardName);
    }
    return [...shards].map((name) => this.shardRel(name));
  }

  async putLink(record: LinkRecord): Promise<string[]> {
    const shardName = this.linkShardIndex.get(record.id);
    if (!shardName) return this.addLink(record);
    this.links.set(record.id, record);
    await this.rewriteShard(shardName);
    return [this.shardRel(shardName)];
  }

  async deleteLink(id: string): Promise<string[]> {
    const shardName = this.linkShardIndex.get(id);
    if (!shardName) return [];
    this.links.delete(id);
    this.linkShardIndex.delete(id);
    const changed: string[] = [];
    const shardIndex = this.shards.findIndex((s) => s.name === shardName);
    const shard = this.shards[shardIndex];
    shard.ids = shard.ids.filter((linkId) => linkId !== id);
    if (shard.ids.length === 0) {
      await fsp.rm(this.abs(this.shardRel(shardName)), { force: true });
      this.shards.splice(shardIndex, 1);
    } else {
      await this.rewriteShard(shardName);
    }
    changed.push(this.shardRel(shardName));
    if (this.searchTextLower.has(id)) {
      changed.push(await this.appendSearchText(id, ''));
    }
    return changed;
  }

  private async rewriteShard(shardName: string): Promise<void> {
    const shard = this.shards.find((s) => s.name === shardName);
    if (!shard) return;
    const lines = shard.ids
      .map((id) => this.links.get(id))
      .filter((record): record is LinkRecord => Boolean(record))
      .map((record) => JSON.stringify(record));
    const content = lines.length > 0 ? lines.join('\n') + '\n' : '';
    await this.atomicWrite(this.shardRel(shardName), content);
  }

  async writeTextFile(rel: string, content: string): Promise<void> {
    await this.atomicWrite(rel, content);
  }

  async saveCollections(): Promise<string[]> {
    const list = [...this.collections.values()];
    await this.atomicWrite(COLLECTIONS_FILE, JSON.stringify(list, null, 2) + '\n');
    return [COLLECTIONS_FILE];
  }

  async deleteArchiveFile(archivePath: string): Promise<string[]> {
    const normalized = archivePath.replace(/\\/g, '/');
    if (!normalized.startsWith(`${ARCHIVES_DIR}/`) && !normalized.startsWith('files/')) return [];
    await fsp.rm(this.abs(normalized), { force: true });
    return [normalized];
  }

  // ---------------------------------------------------------------- 查询

  search(query: SearchQuery): SearchResult {
    let tagFilter = query.tag?.trim().toLowerCase();
    let collectionFilter = query.collectionId;
    let archivedFilter = query.archived;
    let siteFilter = '';
    let afterDate = '';
    let beforeDate = '';
    let pinnedOnly = false;
    let deadOnly = false;
    let failedOnly = false;
    let readFilter = query.read;
    const tokens: string[] = [];

    for (const part of (query.q ?? '').split(/\s+/)) {
      if (!part) continue;
      const lower = part.toLowerCase();
      if (lower.startsWith('tag:')) tagFilter = part.slice(4).toLowerCase();
      else if (lower.startsWith('collection:')) collectionFilter = part.slice(11);
      else if (lower === 'is:archived') archivedFilter = true;
      else if (lower === 'is:unarchived') archivedFilter = false;
      else if (lower === 'is:pinned') pinnedOnly = true;
      else if (lower === 'is:dead') deadOnly = true;
      else if (lower === 'is:failed') failedOnly = true;
      else if (lower === 'is:read') readFilter = true;
      else if (lower === 'is:unread') readFilter = false;
      else if (lower.startsWith('site:')) siteFilter = part.slice(5).toLowerCase();
      else if (lower.startsWith('after:')) afterDate = part.slice(6);
      else if (lower.startsWith('before:')) beforeDate = part.slice(7);
      else tokens.push(lower);
    }

    let items = [...this.links.values()];

    if (collectionFilter === NO_COLLECTION) {
      items = items.filter((link) => !link.collectionId);
    } else if (collectionFilter) {
      items = items.filter((link) => link.collectionId === collectionFilter);
    }
    if (tagFilter) {
      items = items.filter((link) => link.tags.some((tag) => tag.toLowerCase() === tagFilter));
    }
    if (archivedFilter !== undefined) {
      items = items.filter((link) => (archivedFilter ? Boolean(link.archivedAt) : !link.archivedAt));
    }
    if (pinnedOnly) {
      items = items.filter((link) => Boolean(link.pinned));
    }
    if (deadOnly) {
      items = items.filter((link) => Boolean(link.isDead));
    }
    if (failedOnly) {
      items = items.filter((link) => link.archiveStatus === 'failed');
    }
    if (readFilter !== undefined) {
      items = items.filter((link) => (readFilter ? Boolean(link.readAt) : !link.readAt));
    }
    if (siteFilter) {
      items = items.filter((link) => {
        try {
          return new URL(link.url).hostname.toLowerCase().includes(siteFilter);
        } catch {
          return false;
        }
      });
    }
    if (afterDate) {
      items = items.filter((link) => link.createdAt.slice(0, 10) >= afterDate);
    }
    if (beforeDate) {
      items = items.filter((link) => link.createdAt.slice(0, 10) <= beforeDate);
    }
    if (tokens.length > 0) {
      items = items.filter((link) => {
        const highlights = (link.highlights ?? [])
          .map((item) => `${item.text} ${item.note ?? ''}`)
          .join(' ');
        const haystack = `${link.title}\n${link.url}\n${link.description ?? ''}\n${
          link.siteName ?? ''
        }\n${link.tags.join(' ')}\n${link.notes ?? ''}\n${highlights}`.toLowerCase();
        const fulltext = this.searchTextLower.get(link.id) ?? '';
        return tokens.every((token) => haystack.includes(token) || fulltext.includes(token));
      });
    }

    const sort = query.sort ?? 'updated';
    const order = query.order ?? 'desc';
    const factor = order === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      let result = 0;
      if (sort === 'title') result = a.title.localeCompare(b.title, 'zh-Hans-CN');
      else if (sort === 'created') result = a.createdAt.localeCompare(b.createdAt);
      else result = a.updatedAt.localeCompare(b.updatedAt);
      if (result === 0) result = a.id.localeCompare(b.id);
      return result * factor;
    });

    const total = items.length;
    const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 500);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage).map((link) => {
      if (tokens.length === 0) return link;
      const text = this.searchText.get(link.id);
      if (!text) return link;
      const lower = text.toLowerCase();
      let index = -1;
      let token = '';
      for (const candidate of tokens) {
        const found = lower.indexOf(candidate);
        if (found !== -1 && (index === -1 || found < index)) {
          index = found;
          token = candidate;
        }
      }
      if (index === -1) return link;
      const snippetStart = Math.max(0, index - 60);
      const snippetEnd = Math.min(text.length, index + token.length + 60);
      const snippet = `${snippetStart > 0 ? '…' : ''}${text
        .slice(snippetStart, snippetEnd)
        .replace(/\s+/g, ' ')}${snippetEnd < text.length ? '…' : ''}`;
      return { ...link, snippet };
    });
    return { items: pageItems, total, page, perPage };
  }

  findById(id: string): LinkRecord | undefined {
    return this.links.get(id);
  }

  findByUrl(url: string): LinkRecord | undefined {
    for (const link of this.links.values()) {
      if (link.url === url) return link;
    }
    return undefined;
  }

  topTags(limit = 500): Array<{ tag: string; count: number }> {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const link of this.links.values()) {
      for (const tag of link.tags) {
        const key = tag.toLowerCase();
        const entry = counts.get(key);
        if (entry) entry.count++;
        else counts.set(key, { tag, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, limit);
  }

  collectionCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const link of this.links.values()) {
      if (!link.collectionId) continue;
      counts.set(link.collectionId, (counts.get(link.collectionId) ?? 0) + 1);
    }
    return counts;
  }

  stats(): {
    links: number;
    archived: number;
    failed: number;
    dead: number;
    unread: number;
    collections: number;
    tags: number;
    uncategorized: number;
    totalArchiveBytes: number;
  } {
    let archived = 0;
    let failed = 0;
    let uncategorized = 0;
    let unread = 0;
    let dead = 0;
    let totalArchiveBytes = 0;
    for (const link of this.links.values()) {
      if (link.archivedAt) archived++;
      if (link.archiveStatus === 'failed') failed++;
      if (!link.collectionId) uncategorized++;
      if (!link.readAt) unread++;
      if (link.isDead) dead++;
      totalArchiveBytes +=
        (link.archiveSize ?? 0) +
        (link.readableSize ?? 0) +
        (link.screenshotSize ?? 0) +
        (link.pdfSize ?? 0);
    }
    return {
      links: this.links.size,
      archived,
      failed,
      dead,
      unread,
      collections: this.collections.size,
      tags: this.topTags(100000).length,
      uncategorized,
      totalArchiveBytes,
    };
  }

  archiveUsage(): { files: number; bytes: number } {
    let files = 0;
    let bytes = 0;
    for (const link of this.links.values()) {
      if (link.archivedAt && link.archivePath) {
        files++;
        bytes += link.archiveSize ?? 0;
      }
    }
    return { files, bytes };
  }
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export { NO_COLLECTION, ARCHIVES_DIR, LINKS_DIR };
