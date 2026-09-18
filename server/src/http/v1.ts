import { Router, type NextFunction, type Request, type Response } from 'express';
import type { DataService } from '../services/service.js';
import { HttpError } from '../util/misc.js';

/**
 * 兼容层：提供 Linkwarden 风格的 REST API（/api/v1/*），
 * 便于 Floccus 等第三方客户端接入。仅覆盖常用读写接口。
 */

function handle(
  fn: (req: Request, res: Response) => Promise<void> | void
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function normalizeTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
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

export function createV1Router(service: DataService): Router {
  const router = Router();

  const linkJson = (link: ReturnType<DataService['requireLink']>): Record<string, unknown> => ({
    id: link.id,
    name: link.title,
    url: link.url,
    description: link.description ?? '',
    type: link.kind === 'file' ? 'file' : 'url',
    collectionId: link.collectionId ?? null,
    tags: link.tags.map((tag) => ({ id: tag, name: tag })),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  });

  router.get(
    '/links',
    handle((req, res) => {
      const perPage = Math.min(Math.max(Number(req.query.perPage ?? 50) || 50, 1), 200);
      const page = Math.max(Number(req.query.cursor ?? 1) || 1, 1);
      const result = service.search({
        q: typeof req.query.search === 'string' ? req.query.search : undefined,
        page,
        perPage,
        sort: 'updated',
        order: 'desc',
      });
      res.json({
        response: result.items.map(linkJson),
        cursor: page * perPage < result.total ? page + 1 : null,
      });
    })
  );

  router.post(
    '/links',
    handle(async (req, res) => {
      const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!url) throw new HttpError(400, 'URL 不能为空');
      const link = await service.addLink({
        url,
        title: typeof req.body?.name === 'string' ? req.body.name : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        tags: normalizeTagList(req.body?.tags),
        collectionId: typeof req.body?.collectionId === 'string' ? req.body.collectionId : null,
        fetchMetadata: req.body?.fetchMetadata !== false,
      });
      res.status(201).json(linkJson(link));
    })
  );

  router.put(
    '/links/:id',
    handle(async (req, res) => {
      const link = await service.updateLink(req.params.id, {
        title: typeof req.body?.name === 'string' ? req.body.name : undefined,
        description:
          typeof req.body?.description === 'string' ? req.body.description : undefined,
        tags:
          req.body?.tags === undefined ? undefined : normalizeTagList(req.body.tags),
        collectionId:
          typeof req.body?.collectionId === 'string' ? req.body.collectionId : undefined,
      });
      res.json(linkJson(link));
    })
  );

  router.delete(
    '/links/:id',
    handle(async (req, res) => {
      await service.deleteLink(req.params.id);
      res.json({ success: true });
    })
  );

  router.get(
    '/collections',
    handle((_req, res) => {
      res.json({
        response: service.listCollections().map((collection) => ({
          id: collection.id,
          name: collection.name,
          parentId: collection.parentId ?? null,
          color: collection.color ?? '',
        })),
      });
    })
  );

  router.post(
    '/collections',
    handle(async (req, res) => {
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      if (!name.trim()) throw new HttpError(400, '收藏夹名称不能为空');
      const collection = await service.createCollection({
        name,
        parentId: typeof req.body?.parentId === 'string' ? req.body.parentId : null,
      });
      res.status(201).json({
        id: collection.id,
        name: collection.name,
        parentId: collection.parentId ?? null,
      });
    })
  );

  router.put(
    '/collections/:id',
    handle(async (req, res) => {
      const collection = await service.updateCollection(req.params.id, {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      });
      res.json({ id: collection.id, name: collection.name, parentId: collection.parentId ?? null });
    })
  );

  router.delete(
    '/collections/:id',
    handle(async (req, res) => {
      await service.deleteCollection(req.params.id);
      res.json({ success: true });
    })
  );

  router.get(
    '/tags',
    handle((_req, res) => {
      res.json({
        response: service.store.topTags().map((item) => ({
          id: item.tag,
          name: item.tag,
          count: item.count,
        })),
      });
    })
  );

  return router;
}
