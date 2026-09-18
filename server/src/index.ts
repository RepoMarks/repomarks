import { loadConfig } from './config.js';
import { DataService } from './services/service.js';
import { Auth } from './auth.js';
import { createApp } from './http/server.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const service = new DataService(config);
  const auth = new Auth(config.authPassword, config.sessionSecret);

  logger.info('正在初始化数据仓库…');
  await service.init();

  const app = createApp(config, service, auth);
  const server = app.listen(config.port, config.host, () => {
    logger.info(
      `RepoMarks 已启动: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}${config.basePath}`
    );
    logger.info(`数据仓库: ${service.repo.remoteUrl} (本地目录 ${config.dataDir})`);
    const stats = service.store.stats();
    logger.info(`当前数据: ${stats.links} 条链接 / ${stats.collections} 个收藏夹 / ${stats.archived} 个存档`);
  });

  if (config.refreshArchiveDays > 0) {
    const refresh = (): void => {
      void service
        .refreshStaleArchives(config.refreshArchiveDays, config.refreshArchiveLimit)
        .catch((err) => logger.warn(`定时重新存档失败: ${(err as Error).message}`));
    };
    const initial = setTimeout(refresh, 90_000);
    initial.unref?.();
    const interval = setInterval(refresh, 24 * 60 * 60 * 1000);
    interval.unref?.();
  }

  if (config.feedSyncIntervalHours > 0) {
    const interval = setInterval(
      () => {
        void service
          .syncAllFeeds()
          .catch((err) => logger.warn(`RSS 同步失败: ${(err as Error).message}`));
      },
      config.feedSyncIntervalHours * 60 * 60 * 1000
    );
    interval.unref?.();
  }

  let timer: NodeJS.Timeout | null = null;
  if (config.syncIntervalMs > 0) {
    timer = setInterval(() => {
      if (service.syncState.syncing) return;
      service
        .runSync()
        .then((outcome) => {
          if (outcome.changed) logger.info('后台同步完成，数据已更新');
        })
        .catch((err) => logger.warn(`后台同步失败: ${(err as Error).message}`));
    }, config.syncIntervalMs);
    timer.unref?.();
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`收到 ${signal}，正在退出…`);
    if (timer) clearInterval(timer);
    server.close();
    if (service.syncState.pendingPush) {
      try {
        await Promise.race([
          service.runSync(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      } catch (err) {
        logger.warn(`退出前推送失败: ${(err as Error).message}`);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`启动失败: ${(err as Error).message}`);
  process.exit(1);
});
