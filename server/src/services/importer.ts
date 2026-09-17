import * as cheerio from 'cheerio';

export interface ImportedEntry {
  url: string;
  title: string;
  createdAt?: string;
  folder: string[];
  tags?: string[];
}

export interface ParsedImport {
  entries: ImportedEntry[];
  folderCount: number;
}

function toIsoSeconds(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) {
    const ms = num > 1e12 ? num : num * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** 解析浏览器导出的 Netscape 书签 HTML（Chrome/Edge/Firefox） */
export function parseNetscapeBookmarks(html: string): ParsedImport {
  const $ = cheerio.load(html);
  const entries: ImportedEntry[] = [];
  const folders = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (dl: any, pathParts: string[]): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dl.children('dt').each((_: number, dt: any) => {
      const $dt = $(dt);
      const $heading = $dt.children('h3').first();
      if ($heading.length === 0) {
        const $anchor = $dt.find('a').first();
        if ($anchor.length > 0) {
          const href = ($anchor.attr('href') ?? '').trim();
          if (!/^https?:\/\//i.test(href)) return;
          entries.push({
            url: href,
            title: ($anchor.text() || href).trim(),
            createdAt: toIsoSeconds($anchor.attr('add_date') ?? $anchor.attr('ADD_DATE')),
            folder: pathParts,
          });
          return;
        }
      }
      if ($heading.length > 0) {
        const name = $heading.text().trim() || '未命名收藏夹';
        const nextPath = [...pathParts, name];
        folders.add(nextPath.join('/'));
        const nested = $dt.find('dl').first();
        if (nested.length > 0) {
          walk(nested, nextPath);
          return;
        }
        const sibling = $dt.next('dl').first();
        if (sibling.length > 0) {
          walk(sibling, nextPath);
        }
      }
    });
  };

  const rootDl = $('dl').first();
  if (rootDl.length > 0) {
    walk(rootDl, []);
  }
  return { entries, folderCount: folders.size };
}

function normalizeTagList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
          return (item as { name: string }).name;
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeFolder(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[/\\>]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === 'string') return [obj.name];
  }
  return [];
}

/**
 * 通用 JSON 导入：
 * - 纯数组：[{url, title, tags, folder}]
 * - 对象：{ links: [...], collections: [...] }，兼容 Linkwarden 等导出格式
 */
export function parseJsonImport(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON 解析失败: ${(err as Error).message}`);
  }
  const rawLinks: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.links)
      ? ((data as Record<string, unknown>).links as unknown[])
      : [];

  const entries: ImportedEntry[] = [];
  const folders = new Set<string>();
  for (const raw of rawLinks) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const url = String(item.url ?? item.href ?? item.link ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const title = String(item.title ?? item.name ?? item.label ?? url).trim() || url;
    const folder = normalizeFolder(item.folder ?? item.collection ?? item.path ?? item.category);
    if (folder.length > 0) folders.add(folder.join('/'));
    entries.push({
      url,
      title,
      createdAt: toIsoSeconds(item.createdAt ?? item.created_at ?? item.addDate ?? item.addedAt),
      folder,
      tags: normalizeTagList(item.tags ?? item.tag),
    });
  }
  return { entries, folderCount: folders.size };
}

export function parseTags(value: unknown): string[] {
  return normalizeTagList(value);
}
