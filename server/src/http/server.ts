import express, { type Express, type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '../config.js';
import type { Auth } from '../auth.js';
import type { DataService } from '../services/service.js';
import { createRouter } from './routes.js';
import { createV1Router } from './v1.js';
import { createPublicRouter } from './public.js';
import { translateServerMessage } from './errors-i18n.js';
import { HttpError } from '../util/misc.js';
import { logger } from '../logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../../web/dist');

export function createApp(config: Config, service: DataService, auth: Auth): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    next();
  });
  const base = config.basePath;
  auth.setApiKeyChecker((token) => service.authenticateApiKey(token));
  app.use(`${base}/api`, auth.middleware, createRouter(service, auth));
  app.use(`${base}/api/v1`, auth.middleware, createV1Router(service));
  app.use(base, createPublicRouter(service, config.sessionSecret));

  if (fs.existsSync(webDist)) {
    const staticOptions = {
      index: false,
      maxAge: '1h',
      setHeaders: (res: express.Response, filePath: string) => {
        if (filePath.endsWith('index.html')) res.setHeader('cache-control', 'no-cache');
      },
    };
    app.use(base || '/', express.static(webDist, staticOptions));
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const spaPattern = new RegExp(`^${escapedBase}/(?!api/|share/|v1/).*`);
    app.get(spaPattern, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.get(base || '/', (_req, res) => {
      res
        .status(200)
        .send('RepoMarks API 正在运行。前端尚未构建，请在项目根目录执行 npm run build 后重启。');
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    const language = req.header('x-ui-language') ?? req.header('accept-language');
    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: translateServerMessage(err.message, language),
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`请求处理失败: ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    res.status(500).json({
      error: translateServerMessage('服务器内部错误', language),
    });
  };
  app.use(errorHandler);

  return app;
}
