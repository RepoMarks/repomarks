import * as cheerio from 'cheerio';
import { fetchHtml } from './metadata.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 RepoMarks/0.1';

const MAX_CSS_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_TOTAL_INLINE = 8_000_000;
const MAX_IMAGES = 100;
const CONCURRENCY = 6;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

async function fetchBuffer(url: string, timeoutMs: number): Promise<{ buffer: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0] || 'application/octet-stream';
    return { buffer: Buffer.from(await res.arrayBuffer()), type };
  } catch {
    return null;
  }
}

/**
 * 无浏览器环境下的轻量存档：
 * - 移除脚本/iframe 等动态内容
 * - 内联样式表（有预算上限）
 * - 同源图片转为 data URI，跨域图片保留绝对地址
 */
export async function captureBasicArchive(url: string, timeoutMs: number): Promise<string> {
  const { html, finalUrl } = await fetchHtml(url, timeoutMs);
  const $ = cheerio.load(html);

  $('script, noscript, template, iframe, object, embed').remove();
  $('meta[http-equiv="Content-Security-Policy"]').remove();
  $('base').remove();
  $(
    'link[rel="preload"], link[rel="prefetch"], link[rel="modulepreload"], link[rel="dns-prefetch"], link[rel="preconnect"], link[rel="preconnect"]'
  ).remove();
  if (!$('meta[name="repomarks-archive"]').length) {
    $('head').prepend(`<meta name="repomarks-archive" content="basic">`);
  }
  if (!$('meta[charset]').length && !$('meta[http-equiv="Content-Type"]').length) {
    $('head').prepend('<meta charset="utf-8">');
  }
  if (!$('meta[name="viewport"]').length) {
    $('head').prepend('<meta name="viewport" content="width=device-width, initial-scale=1">');
  }

  let budget = MAX_TOTAL_INLINE;
  let origin = '';
  try {
    origin = new URL(finalUrl).origin;
  } catch {
    origin = '';
  }

  const stylesheets = $('link[rel~="stylesheet"]').toArray();
  for (const element of stylesheets) {
    const $el = $(element);
    const href = $el.attr('href');
    if (!href) {
      $el.remove();
      continue;
    }
    let absolute: string;
    try {
      absolute = new URL(href, finalUrl).toString();
    } catch {
      $el.remove();
      continue;
    }
    let css: string | null = null;
    if (budget > 0) {
      const fetched = await fetchBuffer(absolute, timeoutMs);
      if (fetched && fetched.type.includes('css')) {
        const text = fetched.buffer.toString('utf8').slice(0, Math.min(MAX_CSS_BYTES, budget));
        css = text;
        budget -= text.length;
      }
    }
    if (css !== null) {
      $el.replaceWith(`<style>\n${css}\n</style>`);
    } else {
      $el.attr('href', absolute);
    }
  }

  const images = $('img, source').toArray().slice(0, MAX_IMAGES);
  await mapLimit(images, CONCURRENCY, async (element) => {
    const $el = $(element);
    const src =
      $el.attr('src') ??
      $el.attr('data-src') ??
      $el.attr('data-original') ??
      $el.attr('data-lazy-src') ??
      $el.attr('data-lazy');
    if (src) {
      let absolute: string | null = null;
      try {
        absolute = new URL(src, finalUrl).toString();
      } catch {
        absolute = null;
      }
      if (absolute) {
        const sameOrigin = origin !== '' && absolute.startsWith(`${origin}/`);
        if (sameOrigin && budget > 0) {
          const fetched = await fetchBuffer(absolute, timeoutMs);
          if (fetched && fetched.buffer.length <= MAX_IMAGE_BYTES && fetched.buffer.length <= budget) {
            budget -= fetched.buffer.length;
            $el.attr('src', `data:${fetched.type};base64,${fetched.buffer.toString('base64')}`);
            return;
          }
        }
        $el.attr('src', absolute);
      }
    }
    const srcset = $el.attr('srcset');
    if (srcset) {
      const converted = srcset
        .split(',')
        .map((part) => {
          const [candidate, ...rest] = part.trim().split(/\s+/);
          try {
            return [new URL(candidate, finalUrl).toString(), ...rest].join(' ');
          } catch {
            return part.trim();
          }
        })
        .join(', ');
      $el.attr('srcset', converted);
    }
  });

  $('[href]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    if (!href) return;
    if (/^(#|data:|javascript:|mailto:|tel:)/i.test(href)) return;
    try {
      $el.attr('href', new URL(href, finalUrl).toString());
    } catch {
      /* 保留原值 */
    }
  });

  const header = `<!-- RepoMarks lightweight archive of ${finalUrl} at ${new Date().toISOString()} -->\n`;
  return `${header}<!DOCTYPE html>\n${$.html()}`;
}
