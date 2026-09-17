import * as cheerio from 'cheerio';
import { HttpError } from '../util/misc.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 RepoMarks/0.1';

export interface FetchedMetadata {
  title?: string;
  description?: string;
  siteName?: string;
  favicon?: string;
  previewImage?: string;
  contentType?: string;
  resolvedUrl: string;
}

export function normalizeUrl(input: string): string {
  let value = (input ?? '').trim();
  if (!value) throw new HttpError(400, 'URL 不能为空');
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) value = `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, `无效的 URL: ${input}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, '仅支持 http/https 链接');
  }
  return parsed.toString();
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return true;
  }
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function assertAllowedUrl(url: string, allowPrivate: boolean): void {
  if (allowPrivate) return;
  const { hostname } = new URL(url);
  if (isPrivateHostname(hostname)) {
    throw new HttpError(400, '出于安全考虑，默认禁止访问内网地址（可设置 ALLOW_PRIVATE_URLS=true 解除）');
  }
}

function absolute(base: string, value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

export async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchHtml(
  url: string,
  timeoutMs: number,
  maxBytes = 2_000_000
): Promise<{ html: string; finalUrl: string; contentType: string; response: Response }> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
  } catch (err) {
    throw new HttpError(502, `无法访问 ${url}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new HttpError(502, `抓取失败 HTTP ${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') ?? '';
  const html = contentType.includes('html') || contentType === '' ? await readLimited(res, maxBytes) : '';
  return { html, finalUrl: res.url || url, contentType, response: res };
}

export async function fetchMetadata(url: string, timeoutMs: number): Promise<FetchedMetadata> {
  const { html, finalUrl, contentType } = await fetchHtml(url, timeoutMs);
  const $ = cheerio.load(html);
  const content = (selector: string): string | undefined => {
    const value = $(selector).first().attr('content');
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  const title =
    content('meta[property="og:title"]') ||
    content('meta[name="twitter:title"]') ||
    $('title').first().text().trim() ||
    undefined;
  const description =
    content('meta[property="og:description"]') ||
    content('meta[name="description"]') ||
    content('meta[name="twitter:description"]');
  const siteName = content('meta[property="og:site_name"]');
  const previewImage =
    absolute(finalUrl, content('meta[property="og:image"]')) ??
    absolute(finalUrl, content('meta[name="twitter:image"]'));
  const iconHref =
    $('link[rel~="icon"]').first().attr('href') ??
    $('link[rel="apple-touch-icon"]').first().attr('href') ??
    '/favicon.ico';
  const favicon = absolute(finalUrl, iconHref);
  let hostname = finalUrl;
  try {
    hostname = new URL(finalUrl).hostname;
  } catch {
    /* ignore */
  }

  return {
    title: title?.replace(/\s+/g, ' ').slice(0, 500),
    description: description?.replace(/\s+/g, ' ').slice(0, 2000),
    siteName: (siteName ?? hostname).slice(0, 200),
    favicon,
    previewImage,
    contentType,
    resolvedUrl: finalUrl,
  };
}
