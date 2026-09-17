import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import type { Auth } from '../auth.js';
import type { DataService } from '../services/service.js';
import { fetchMetadata, normalizeUrl } from '../services/metadata.js';
import type { LinkInput } from '../store/types.js';
import { HttpError } from '../util/misc.js';

type Handler = (req: Request, res: Response) => Promise<void> | void;

function wrap(handler: Handler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function requireString(value: unknown, name: string): string {
  const result = str(value)?.trim();
  if (!result) throw new HttpError(400, `缺少参数 ${name}`);
  return result;
}

const FAVICON_CACHE_MAX = 300;
const faviconCache = new Map<string, { body: Buffer; type: string; at: number }>();

export function createRouter(service: DataService, auth: Auth): Router {
  const router = Router();

  // ------------------------------------------------------------ 认证

  router.post(
    '/auth/login',
    wrap(async (req, res) => {
      const ip = req.ip ?? 'unknown';
      if (!auth.checkRateLimit(ip)) {
        throw new HttpError(429, '尝试次数过多，请稍后再试');
      }
      if (!auth.verifyPassword(String(req.body?.password ?? ''))) {
        auth.recordFailure(ip);
        throw new HttpError(401, '密码错误');
      }
      auth.login(res);
      res.json({ ok: true, enabled: auth.enabled });
    })
  );

  router.post(
    '/auth/logout',
    wrap((_req, res) => {
      auth.logout(res);
      res.json({ ok: true });
    })
  );

  router.get(
    '/auth/session',
    wrap((req, res) => {
      res.json({ enabled: auth.enabled, authenticated: auth.isAuthenticated(req) });
    })
  );

  // ------------------------------------------------------------ 状态

  router.get(
    '/status',
    wrap(async (_req, res) => {
      res.json(await service.status());
    })
  );

  router.post(
    '/sync',
    wrap(async (_req, res) => {
      try {
        const outcome = await service.runSync();
        res.json({ ok: true, ...outcome });
      } catch (err) {
        throw new HttpError(502, (err as Error).message);
      }
    })
  );

  // ------------------------------------------------------------ 链接

  router.get(
    '/links',
    wrap((req, res) => {
      const archivedParam = str(req.query.archived);
      res.json(
        service.search({
          q: str(req.query.q),
          collectionId: str(req.query.collection),
          tag: str(req.query.tag),
          archived: archivedParam === undefined ? undefined : archivedParam === 'true',
          sort: (str(req.query.sort) as 'created' | 'updated' | 'title') ?? 'updated',
          order: (str(req.query.order) as 'asc' | 'desc') ?? 'desc',
          page: Number(req.query.page) || 1,
          perPage: Number(req.query.perPage) || 50,
        })
      );
    })
  );

  router.post(
    '/links',
    wrap(async (req, res) => {
      const link = await service.addLink({
        url: requireString(req.body?.url, 'url'),
        title: str(req.body?.title),
        description: str(req.body?.description),
        tags: Array.isArray(req.body?.tags) ? req.body.tags : undefined,
        collectionId: req.body?.collectionId === undefined ? undefined : req.body.collectionId,
        notes: str(req.body?.notes),
        pinned: typeof req.body?.pinned === 'boolean' ? req.body.pinned : undefined,
        fetchMetadata: req.body?.fetchMetadata !== false,
      });
      res.status(201).json(link);
    })
  );

  router.get(
    '/links/:id',
    wrap((req, res) => {
      res.json(service.requireLink(req.params.id));
    })
  );

  router.patch(
    '/links/:id',
    wrap(async (req, res) => {
      const patch: Partial<LinkInput> = {};
      for (const key of ['url', 'title', 'description', 'notes'] as const) {
        if (req.body?.[key] !== undefined) patch[key] = String(req.body[key]);
      }
      if (Array.isArray(req.body?.tags)) patch.tags = req.body.tags;
      if (req.body?.collectionId !== undefined) patch.collectionId = req.body.collectionId;
      if (typeof req.body?.pinned === 'boolean') patch.pinned = req.body.pinned;
      const link = await service.updateLink(req.params.id, patch);
      res.json(link);
    })
  );

  router.delete(
    '/links/:id',
    wrap(async (req, res) => {
      await service.deleteLink(req.params.id);
      res.json({ ok: true });
    })
  );

  router.post(
    '/links/:id/refetch',
    wrap(async (req, res) => {
      res.json(await service.refetchLink(req.params.id));
    })
  );

  router.post(
    '/links/:id/archive',
    wrap(async (req, res) => {
      res.status(202).json(await service.archiveLink(req.params.id));
    })
  );

  router.get(
    '/links/:id/archive',
    wrap(async (req, res) => {
      const html = await service.readArchive(req.params.id);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader(
        'content-security-policy',
        "default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline' *; font-src * data:; script-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
      );
      res.setHeader('x-content-type-options', 'nosniff');
      res.send(html);
    })
  );

  // ------------------------------------------------------------ 元数据 / 图标

  router.get(
    '/metadata',
    wrap(async (req, res) => {
      const url = normalizeUrl(requireString(req.query.url, 'url'));
      service.assertUrlAllowed(url);
      res.json(await fetchMetadata(url, 15000));
    })
  );

  router.get(
    '/favicon',
    wrap(async (req, res) => {
      const url = requireString(req.query.url, 'url');
      if (!/^https?:\/\//i.test(url)) throw new HttpError(400, '无效的图标地址');
      service.assertUrlAllowed(url);
      const cached = faviconCache.get(url);
      if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) {
        res.setHeader('content-type', cached.type);
        res.setHeader('cache-control', 'public, max-age=86400');
        res.send(cached.body);
        return;
      }
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; RepoMarks/0.1)', accept: 'image/*' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = (response.headers.get('content-type') ?? '').split(';')[0];
        if (!type.startsWith('image/')) throw new Error('不是图片');
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 512 * 1024) throw new Error('图标过大');
        if (faviconCache.size >= FAVICON_CACHE_MAX) {
          const oldest = faviconCache.keys().next().value;
          if (oldest) faviconCache.delete(oldest);
        }
        faviconCache.set(url, { body: buffer, type, at: Date.now() });
        res.setHeader('content-type', type);
        res.setHeader('cache-control', 'public, max-age=86400');
        res.send(buffer);
      } catch {
        res.status(404).end();
      }
    })
  );

  // ------------------------------------------------------------ 收藏夹 / 标签

  router.get(
    '/collections',
    wrap((_req, res) => {
      res.json(service.listCollections());
    })
  );

  router.post(
    '/collections',
    wrap(async (req, res) => {
      const collection = await service.createCollection({
        name: requireString(req.body?.name, 'name'),
        color: str(req.body?.color),
        parentId: req.body?.parentId ?? null,
      });
      res.status(201).json(collection);
    })
  );

  router.patch(
    '/collections/:id',
    wrap(async (req, res) => {
      const collection = await service.updateCollection(req.params.id, {
        name: str(req.body?.name),
        color: str(req.body?.color),
        parentId: req.body?.parentId === undefined ? undefined : req.body.parentId,
      });
      res.json(collection);
    })
  );

  router.delete(
    '/collections/:id',
    wrap(async (req, res) => {
      await service.deleteCollection(req.params.id);
      res.json({ ok: true });
    })
  );

  router.get(
    '/tags',
    wrap((_req, res) => {
      res.json(service.store.topTags());
    })
  );

  // ------------------------------------------------------------ 导入导出

  router.post(
    '/import',
    wrap(async (req, res) => {
      res.json(
        await service.importBookmarks({
          html: str(req.body?.html),
          json: str(req.body?.json),
          defaultCollectionId: req.body?.defaultCollectionId ?? null,
        })
      );
    })
  );

  router.get(
    '/export',
    wrap(async (_req, res) => {
      res.setHeader('content-disposition', 'attachment; filename="repomarks-export.json"');
      res.json(await service.exportData());
    })
  );

  return router;
}
