import express, { type Express, type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '../config.js';
import type { Auth } from '../auth.js';
import type { DataService } from '../services/service.js';
import { createRouter } from './routes.js';
import { HttpError } from '../util/misc.js';
import { logger } from '../logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../../web/dist');

export function createApp(config: Config, service: DataService, auth: Auth): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '50mb' }));
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    next();
  });
  app.use(auth.middleware);
  app.use('/api', createRouter(service, auth));

  if (fs.existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('cache-control', 'no-cache');
        },
      })
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .send('Gitmarks API 正在运行。前端尚未构建，请在项目根目录执行 npm run build 后重启。');
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`请求处理失败: ${message}`);
    if (err instanceof Error && err.stack) logger.debug(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
  };
  app.use(errorHandler);

  return app;
}
