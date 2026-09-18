import { useEffect, useState } from 'react';
import { api, formatBytes, formatDate } from '../api';
import { useApp, useMenu } from '../App';
import { useStatus } from '../hooks';
import { useI18n } from '../i18n';
import type { ApiKeyInfo } from '../types';

export default function SettingsPage() {
  const { t } = useI18n();
  const openMenu = useMenu();
  const { refreshKey, notifyChange } = useApp();
  const status = useStatus(refreshKey, 5000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [keyLabel, setKeyLabel] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);
  const bookmarklet = `javascript:(function(){window.open('${window.location.origin}/?new='+encodeURIComponent(location.href)+'&newTitle='+encodeURIComponent(document.title),'_blank');})()`;

  useEffect(() => {
    let alive = true;
    api
      .listApiKeys()
      .then((keys) => {
        if (alive) setApiKeys(keys);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const createKey = async () => {
    try {
      const result = await api.createApiKey(keyLabel);
      setNewKey(result.key);
      setKeyLabel('');
      setApiKeys((previous) => [result.record, ...previous]);
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const revokeKey = async (id: string) => {
    if (!window.confirm(t('撤销这个 API 密钥？使用它的客户端会立即失效。'))) return;
    try {
      await api.deleteApiKey(id);
      setApiKeys((previous) => previous.filter((item) => item.id !== id));
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await api.sync();
      setMessage(
        outcome.pushed
          ? t('已推送本地提交到远端。')
          : outcome.pulled
            ? t('已从远端拉取最新数据。')
            : t('已是最新状态。')
      );
      notifyChange();
    } catch (err) {
      setMessage(t('同步失败：{msg}', { msg: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <div className="loading-page">{t('加载中…')}</div>;
  }

  const { repo, sync, archive, stats } = status;

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={openMenu}>
          ☰
        </button>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('仓库与状态')}</h2>
      </div>

      <div className="content">
        <div className="page-narrow">
          <div className="panel">
            <h3>{t('Git 仓库')}</h3>
            <dl className="kv">
              <dt>{t('远端地址')}</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{repo.remoteUrl}</dd>
              <dt>{t('分支')}</dt>
              <dd>{repo.branch}</dd>
              <dt>Git LFS</dt>
              <dd>{repo.lfs ? t('已启用（存档与上传文件存 LFS 指针）') : t('未启用')}</dd>
              <dt>{t('当前提交')}</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>
                {repo.head?.slice(0, 12) ?? '-'}
              </dd>
              <dt>{t('最近提交')}</dt>
              <dd>
                {repo.lastCommit
                  ? `${repo.lastCommit.message} (${repo.lastCommit.author}, ${formatDate(repo.lastCommit.date)})`
                  : '-'}
              </dd>
              <dt>{t('本地/远端差异')}</dt>
              <dd>
                {t('待推送 {ahead} 个提交，待拉取 {behind} 个提交', {
                  ahead: repo.ahead,
                  behind: repo.behind,
                })}
                {repo.dirty ? t('（工作区有未提交改动）') : ''}
              </dd>
              <dt>{t('上次同步')}</dt>
              <dd>{formatDate(sync.lastSyncAt)}</dd>
              <dt>{t('上次推送')}</dt>
              <dd>{formatDate(sync.lastPushedAt)}</dd>
              <dt>{t('上次拉取')}</dt>
              <dd>{formatDate(sync.lastPulledAt)}</dd>
              <dt>{t('同步状态')}</dt>
              <dd>
                {sync.syncing && t('正在同步…')}
                {!sync.syncing && sync.lastError && (
                  <span style={{ color: '#ff9aa6' }}>{sync.lastError}</span>
                )}
                {!sync.syncing &&
                  !sync.lastError &&
                  (sync.pendingPush ? t('有待推送的本地提交') : t('正常'))}
              </dd>
            </dl>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn primary" disabled={busy} onClick={() => void syncNow()}>
                {busy && <span className="spinner" />}
                {t('立即同步')}
              </button>
              <a className="btn" href="/api/export">
                {t('导出 JSON')}
              </a>
              <a className="btn" href="/api/export?format=markdown">
                {t('导出 Markdown')}
              </a>
            </div>
            {message && (
              <div className="field-hint" style={{ marginTop: 10 }}>
                {message}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>{t('网页存档')}</h3>
            <dl className="kv">
              <dt>{t('引擎')}</dt>
              <dd>
                {archive.engine === 'singlefile' && t('single-file（完整存档）')}
                {archive.engine === 'basic' && t('轻量内联存档（无浏览器）')}
                {archive.engine === 'off' && t('已关闭')}
              </dd>
              <dt>{t('可用性')}</dt>
              <dd>
                {archive.available
                  ? t('可用')
                  : t('不可用：{reason}', { reason: archive.reason ?? '' })}
              </dd>
              <dt>{t('存档格式')}</dt>
              <dd>{(archive.formats ?? []).join(', ') || '-'}</dd>
              <dt>{t('浏览器')}</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{archive.browserPath ?? '-'}</dd>
              <dt>{t('已存档')}</dt>
              <dd>
                {t('已存档 {archived} / {links} 条，占用 {size}', {
                  archived: stats.archived,
                  links: stats.links,
                  size: formatBytes(stats.totalArchiveBytes),
                })}
                {stats.failed > 0 ? t('，失败 {n} 条', { n: stats.failed }) : ''}
              </dd>
            </dl>
            {archive.engine === 'basic' && (
              <div className="field-hint" style={{ marginTop: 10 }}>
                {t(
                  '安装 Chrome/Chromium 并设置 ARCHIVE_BROWSER_PATH，或安装浏览器后重启，可启用页面级完整存档。'
                )}
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              {status.largestArchives.length > 0 && (
                <div className="field-hint" style={{ marginBottom: 8 }}>
                  {t('最大存档')}：
                  {status.largestArchives
                    .map((item) => `${item.title} (${formatBytes(item.bytes)})`)
                    .join('，')}
                </div>
              )}
              <button
                className="btn"
                onClick={() => {
                  void (async () => {
                    try {
                      const result = await api.refreshArchives(30, 5);
                      setMessage(t('已触发 {count} 条链接的重新存档', { count: result.refreshed }));
                      notifyChange();
                    } catch (err) {
                      window.alert((err as Error).message);
                    }
                  })();
                }}
              >
                {t('刷新超期存档')}
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>{t('API 密钥')}</h3>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              {t(
                '用于浏览器扩展、快捷指令、脚本等第三方客户端。请求时带上 Authorization: Bearer <key> 或 X-API-Key 头即可。'
              )}
            </p>

            <div className="share-row" style={{ maxWidth: 420 }}>
              <input
                type="text"
                value={keyLabel}
                placeholder={t('密钥名称，例如 浏览器扩展')}
                onChange={(event) => setKeyLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createKey();
                }}
              />
              <button className="btn primary" onClick={() => void createKey()}>
                {t('生成')}
              </button>
            </div>

            {newKey && (
              <div className="result-box" style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6 }}>{t('新密钥（只显示这一次，请立即保存）：')}</div>
                <div className="share-row">
                  <input type="text" readOnly value={newKey} />
                  <button
                    className="btn small"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(newKey)
                        .catch(() => window.prompt(t('复制链接'), newKey ?? ''));
                    }}
                  >
                    {t('复制')}
                  </button>
                </div>
              </div>
            )}

            {apiKeys.length > 0 && (
              <div className="highlights" style={{ marginTop: 12 }}>
                {apiKeys.map((item) => (
                  <div className="highlight-item" key={item.id}>
                    <div className="highlight-head">
                      <strong style={{ fontSize: 13.5 }}>{item.label}</strong>
                      <span className="field-hint" style={{ fontFamily: 'monospace' }}>
                        {item.prefix}…
                      </span>
                      <span className="spacer" />
                      <button className="icon-btn danger" onClick={() => void revokeKey(item.id)}>
                        {t('撤销')}
                      </button>
                    </div>
                    <div className="field-hint">
                      {t('创建于 {date}', { date: formatDate(item.createdAt) })}
                      {item.lastUsedAt
                        ? ` · ${t('最近使用 {date}', { date: formatDate(item.lastUsedAt) })}`
                        : ` · ${t('尚未使用')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>{t('保存小工具')}</h3>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              {t('把下面的链接拖到书签栏，点击即可保存当前页面：')}
            </p>
            <div className="share-row">
              <input type="text" readOnly value={bookmarklet} />
              <button
                className="btn small"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(bookmarklet)
                    .catch(() => window.prompt('Bookmarklet', bookmarklet));
                }}
              >
                {t('复制代码')}
              </button>
            </div>
            <div className="field-hint" style={{ marginTop: 8 }}>
              <a href={bookmarklet} onClick={(event) => event.preventDefault()}>
                ⭐ RepoMarks
              </a>
            </div>
          </div>

          <div className="panel">
            <h3>{t('AI 标签（可选）')}</h3>
            <dl className="kv">
              <dt>{t('状态')}</dt>
              <dd>
                {status.ai.enabled
                  ? t('已启用（模型 {model}）', { model: status.ai.model ?? '' })
                  : t('未配置')}
              </dd>
            </dl>
            {!status.ai.enabled && (
              <div className="field-hint" style={{ marginTop: 10 }}>
                {t(
                  '在 .env 中配置 AI_BASE_URL（OpenAI 兼容接口，如 https://api.openai.com/v1，或本地 Ollama 的 http://host.docker.internal:11434/v1）、AI_MODEL 和可选的 AI_API_KEY，重启后即可在链接详情页生成标签与摘要。'
                )}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>{t('数据统计')}</h3>
            <dl className="kv">
              <dt>{t('链接')}</dt>
              <dd>{stats.links}</dd>
              <dt>{t('收藏夹')}</dt>
              <dd>{stats.collections}</dd>
              <dt>{t('标签')}</dt>
              <dd>{stats.tags}</dd>
              <dt>{t('未分类')}</dt>
              <dd>{stats.uncategorized}</dd>
              <dt>{t('服务运行')}</dt>
              <dd>
                {t('{h} 小时 {m} 分（Node {node}）', {
                  h: Math.floor(status.uptimeSeconds / 3600),
                  m: Math.floor((status.uptimeSeconds % 3600) / 60),
                  node: status.node,
                })}
              </dd>
            </dl>
          </div>

          <div className="panel">
            <h3>{t('仓库数据布局')}</h3>
            <pre
              style={{
                margin: 0,
                fontSize: 12.5,
                color: 'var(--muted)',
                overflowX: 'auto',
                background: 'var(--panel-2)',
                padding: 12,
                borderRadius: 8,
              }}
            >
              {[
                'meta.json            仓库元信息',
                'collections.json     收藏夹',
                'links/0000.jsonl     链接分片（每片 1000 条，每行一条记录）',
                'archives/<id>.html.gz 网页存档（gzip 压缩的完整 HTML）',
              ]
                .map((line) => t(line))
                .join('\n')}
            </pre>
            <div className="field-hint" style={{ marginTop: 10 }}>
              {t(
                '直接编辑文件后提交推送，服务会自动拉取并加载；两端同时修改时按 id 合并，更新时间较新的记录优先。'
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
              <button
                className="btn"
                onClick={() => {
                  void (async () => {
                    try {
                      const result = await api.generateIndexes();
                      setIndexMessage(t('已生成 {files} 个索引文件', { files: result.files }));
                      notifyChange();
                    } catch (err) {
                      window.alert((err as Error).message);
                    }
                  })();
                }}
              >
                {t('生成 Markdown 索引')}
              </button>
              {indexMessage && <span className="field-hint">{indexMessage}</span>}
            </div>
          </div>

          {status.warnings.length > 0 && (
            <div className="panel">
              <h3>{t('数据解析警告')}</h3>
              <ul className="warn-list">
                {status.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
