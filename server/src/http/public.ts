import { Router, type NextFunction, type Request, type Response } from 'express';
import type { DataService } from '../services/service.js';
import { HttpError } from '../util/misc.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseUrl(req: Request): string {
  const host = req.get('host') ?? 'localhost';
  return `${req.protocol}://${host}`;
}

type Lang = 'zh' | 'en';

const PT: Record<Lang, Record<string, string>> = {
  zh: {
    links: '条链接',
    rss: 'RSS 订阅',
    poweredBy: '由 RepoMarks 驱动',
    footer: '此页面为公开分享，数据来自分享者的 Git 仓库。',
    archive: '存档',
    reader: '阅读版',
    screenshot: '截图',
    pdf: 'PDF',
  },
  en: {
    links: 'links',
    rss: 'RSS feed',
    poweredBy: 'Powered by RepoMarks',
    footer: "This is a public share page. The data comes from the owner's Git repository.",
    archive: 'Archive',
    reader: 'Reader',
    screenshot: 'Screenshot',
    pdf: 'PDF',
  },
};

function pickLang(req: Request): Lang {
  const best = req.acceptsLanguages(['zh', 'en']);
  return typeof best === 'string' && best.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function pt(lang: Lang, key: string): string {
  return PT[lang][key] ?? key;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function handle(
  fn: (req: Request, res: Response) => Promise<void> | void
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1115; color: #e8ebf1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 40px 20px 80px; }
  header h1 { margin: 0 0 6px; font-size: 24px; }
  header p { margin: 0 0 6px; color: #8d97a8; }
  header a { color: #5b8def; }
  .items { list-style: none; margin: 28px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .item { background: #161a21; border: 1px solid #272e3a; border-radius: 10px; padding: 14px 16px; }
  .item-title a { color: #e8ebf1; font-weight: 600; font-size: 15.5px; text-decoration: none; }
  .item-title a:hover { color: #5b8def; }
  .desc { margin: 6px 0; color: #8d97a8; font-size: 13.5px; }
  .meta { color: #6b7484; font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 8px; }
  .meta a { color: #5b8def; text-decoration: none; }
  footer { margin-top: 36px; color: #6b7484; font-size: 12.5px; }
`;

function renderPage(
  lang: Lang,
  origin: string,
  collection: { name: string; slug?: string; description?: string },
  links: Array<{
    id: string;
    url: string;
    title: string;
    description?: string;
    tags: string[];
    createdAt: string;
    archivePath?: string | null;
    readablePath?: string | null;
    screenshotPath?: string | null;
    pdfPath?: string | null;
    waybackUrl?: string | null;
  }>,
  total: number
): string {
  const slug = collection.slug ?? '';
  const items = links
    .map((link) => {
      const formatLinks: string[] = [];
      const formatUrl = (format: string): string =>
        `${origin}/share/${slug}/links/${link.id}/archive?format=${format}`;
      if (link.archivePath) formatLinks.push(`<a href="${formatUrl('html')}" target="_blank" rel="noreferrer">${pt(lang, 'archive')}</a>`);
      if (link.readablePath) formatLinks.push(`<a href="${formatUrl('readable')}" target="_blank" rel="noreferrer">${pt(lang, 'reader')}</a>`);
      if (link.screenshotPath) formatLinks.push(`<a href="${formatUrl('screenshot')}" target="_blank" rel="noreferrer">${pt(lang, 'screenshot')}</a>`);
      if (link.pdfPath) formatLinks.push(`<a href="${formatUrl('pdf')}" target="_blank" rel="noreferrer">${pt(lang, 'pdf')}</a>`);
      if (link.waybackUrl) formatLinks.push(`<a href="${escapeHtml(link.waybackUrl)}" target="_blank" rel="noreferrer">Wayback</a>`);
      const tags = link.tags.map((tag) => `#${escapeHtml(tag)}`).join(' ');
      return `      <li class="item">
        <div class="item-title"><a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(link.title)}</a></div>
        ${link.description ? `<p class="desc">${escapeHtml(link.description)}</p>` : ''}
        <div class="meta">
          <span>${escapeHtml(hostnameOf(link.url))}</span>
          <span>${escapeHtml(link.createdAt.slice(0, 10))}</span>
          ${tags ? `<span>${tags}</span>` : ''}
          ${formatLinks.join('')}
        </div>
      </li>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(collection.name)} · RepoMarks</title>
  <link rel="alternate" type="application/rss+xml" href="${origin}/share/${slug}/feed.xml">
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(collection.name)}</h1>
      ${collection.description ? `<p>${escapeHtml(collection.description)}</p>` : ''}
      <p>${total} ${pt(lang, 'links')} · <a href="${origin}/share/${slug}/feed.xml">${pt(lang, 'rss')}</a> · ${pt(lang, 'poweredBy')}</p>
    </header>
    <ul class="items">
${items}
    </ul>
    <footer>${pt(lang, 'footer')}</footer>
  </div>
</body>
</html>`;
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

export function createPublicRouter(service: DataService): Router {
  const router = Router();

  router.get(
    '/share/:slug',
    handle((req, res) => {
      const result = service.findPublicCollection(req.params.slug);
      if (!result) throw new HttpError(404, '分享不存在或未公开');
      const origin = baseUrl(req);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('cache-control', 'no-cache');
      res.send(
        renderPage(pickLang(req), origin, result.collection, result.links, result.links.length)
      );
    })
  );

  router.get(
    '/share/:slug/feed.xml',
    handle((req, res) => {
      const result = service.findPublicCollection(req.params.slug);
      if (!result) throw new HttpError(404, '分享不存在或未公开');
      const { collection, links } = result;
      const origin = baseUrl(req);
      const self = `${origin}/share/${collection.slug}/feed.xml`;
      const items = links
        .slice(0, 100)
        .map(
          (link) => `    <item>
      <title>${escapeXml(link.title)}</title>
      <link>${escapeXml(link.url)}</link>
      <guid isPermaLink="true">${escapeXml(link.url)}</guid>
      <pubDate>${new Date(link.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(
        [link.description ?? '', link.tags.map((tag) => `#${tag}`).join(' ')]
          .filter(Boolean)
          .join(' — ')
      )}</description>
    </item>`
        )
        .join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(collection.name)}</title>
    <link>${escapeXml(`${origin}/share/${collection.slug}`)}</link>
    <description>${escapeXml(collection.description ?? '')}</description>
    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
      res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
      res.setHeader('cache-control', 'no-cache');
      res.send(xml);
    })
  );

  router.get(
    '/share/:slug/links/:id/archive',
    handle(async (req, res) => {
      const link = service.findPublicLink(req.params.slug, req.params.id);
      if (!link) throw new HttpError(404, '分享不存在或未公开');
      const format = (req.query.format as string) ?? 'html';
      if (!['html', 'readable', 'screenshot', 'pdf'].includes(format)) {
        throw new HttpError(400, `不支持的存档格式: ${format}`);
      }
      const { data, contentType } = await service.readArchiveFormat(
        link.id,
        format as 'html' | 'readable' | 'screenshot' | 'pdf'
      );
      if (format === 'html') {
        res.setHeader(
          'content-security-policy',
          "default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline' *; font-src * data:; script-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
        );
      }
      res.setHeader('content-type', contentType);
      res.setHeader('x-content-type-options', 'nosniff');
      res.send(data);
    })
  );

  return router;
}
