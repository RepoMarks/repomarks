import * as cheerio from 'cheerio';
import { fetchHtml } from './metadata.js';

export interface ReadableResult {
  title: string;
  text: string;
  chars: number;
}

const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'svg',
  'canvas',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'nav',
  'header',
  'footer',
  'aside',
  'dialog',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
  '.nav',
  '.navbar',
  '.menu',
  '.sidebar',
  '.comments',
  '#comments',
  '.advertisement',
  '.ads',
  '.social-share',
  '.share',
  '.related-posts',
].join(',');

const BLOCK_SELECTORS =
  'br,p,div,section,article,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,figure,figcaption,ul,ol,table,main,aside';

const CANDIDATE_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.post-content',
  '.article-content',
  '.entry-content',
  '#content',
  '.content',
  '.post',
  '.article',
];

function normalizeText(text: string): string {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim());
  const result: string[] = [];
  for (const line of lines) {
    if (line.length === 0) {
      if (result.length > 0 && result[result.length - 1] !== '') result.push('');
      continue;
    }
    result.push(line);
  }
  while (result.length > 0 && result[result.length - 1] === '') result.pop();
  return result.join('\n');
}

export function readableFromHtml(html: string, fallbackTitle: string): ReadableResult {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').first().attr('content')?.trim() ||
    $('title').first().text().trim() ||
    fallbackTitle;

  $(REMOVE_SELECTORS).remove();
  $(BLOCK_SELECTORS).each((_, element) => {
    $(element).append('\n');
  });

  let best = '';
  for (const selector of CANDIDATE_SELECTORS) {
    $(selector).each((_, element) => {
      const candidate = normalizeText($(element).text());
      if (candidate.length > best.length) best = candidate;
    });
  }
  const body = normalizeText($('body').text());
  const text = best.length > 200 ? best : body;
  return { title, text, chars: text.length };
}

export async function extractReadable(url: string, timeoutMs: number): Promise<ReadableResult> {
  const { html, finalUrl } = await fetchHtml(url, timeoutMs);
  return readableFromHtml(html, finalUrl);
}
