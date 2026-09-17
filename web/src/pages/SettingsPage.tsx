import { useState } from 'react';
import { api, formatBytes, formatDate } from '../api';
import { useApp, useMenu } from '../App';
import { useStatus } from '../hooks';

export default function SettingsPage() {
  const openMenu = useMenu();
  const { refreshKey, notifyChange } = useApp();
  const status = useStatus(refreshKey, 5000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const syncNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await api.sync();
      setMessage(
        outcome.pushed
          ? '已推送本地提交到远端。'
          : outcome.pulled
            ? '已从远端拉取最新数据。'
            : '已是最新状态。'
      );
      notifyChange();
    } catch (err) {
      setMessage(`同步失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <div className="loading-page">加载中…</div>;
  }

  const { repo, sync, archive, stats } = status;

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={openMenu}>
          ☰
        </button>
        <h2 style={{ margin: 0, fontSize: 16 }}>仓库与状态</h2>
      </div>

      <div className="content">
        <div className="page-narrow">
          <div className="panel">
            <h3>Git 仓库</h3>
            <dl className="kv">
              <dt>远端地址</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{repo.remoteUrl}</dd>
              <dt>分支</dt>
              <dd>{repo.branch}</dd>
              <dt>当前提交</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{repo.head?.slice(0, 12) ?? '（尚无提交）'}</dd>
              <dt>最近提交</dt>
              <dd>{repo.lastCommit ? `${repo.lastCommit.message}（${repo.lastCommit.author}，${formatDate(repo.lastCommit.date)}）` : '-'}</dd>
              <dt>本地/远端差异</dt>
              <dd>
                待推送 {repo.ahead} 个提交，待拉取 {repo.behind} 个提交
                {repo.dirty ? '（工作区有未提交改动）' : ''}
              </dd>
              <dt>上次同步</dt>
              <dd>{formatDate(sync.lastSyncAt)}</dd>
              <dt>上次推送</dt>
              <dd>{formatDate(sync.lastPushedAt)}</dd>
              <dt>上次拉取</dt>
              <dd>{formatDate(sync.lastPulledAt)}</dd>
              <dt>同步状态</dt>
              <dd>
                {sync.syncing && '同步中…'}
                {!sync.syncing && sync.lastError && <span style={{ color: '#ff9aa6' }}>{sync.lastError}</span>}
                {!sync.syncing && !sync.lastError && (sync.pendingPush ? '有待推送的提交' : '正常')}
              </dd>
            </dl>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn primary" disabled={busy} onClick={() => void syncNow()}>
                {busy && <span className="spinner" />}
                立即同步
              </button>
              <a className="btn" href="/api/export">
                导出 JSON
              </a>
            </div>
            {message && (
              <div className="field-hint" style={{ marginTop: 10 }}>
                {message}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>网页存档</h3>
            <dl className="kv">
              <dt>引擎</dt>
              <dd>
                {archive.engine === 'singlefile' && 'single-file（完整存档）'}
                {archive.engine === 'basic' && '轻量内联存档（无浏览器）'}
                {archive.engine === 'off' && '已关闭'}
              </dd>
              <dt>可用性</dt>
              <dd>{archive.available ? '可用' : `不可用${archive.reason ? `：${archive.reason}` : ''}`}</dd>
              <dt>存档格式</dt>
              <dd>{(archive.formats ?? []).join('、') || '-'}</dd>
              <dt>浏览器</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{archive.browserPath ?? '-'}</dd>
              <dt>已存档</dt>
              <dd>
                {stats.archived} / {stats.links} 条，占用 {formatBytes(stats.totalArchiveBytes)}
                {stats.failed > 0 ? `，失败 ${stats.failed} 条` : ''}
              </dd>
            </dl>
            {archive.engine === 'basic' && (
              <div className="field-hint" style={{ marginTop: 10 }}>
                安装 Chrome/Chromium 并设置 ARCHIVE_BROWSER_PATH，或安装浏览器后重启，可启用页面级完整存档。
              </div>
            )}
          </div>

          <div className="panel">
            <h3>数据统计</h3>
            <dl className="kv">
              <dt>链接</dt>
              <dd>{stats.links}</dd>
              <dt>收藏夹</dt>
              <dd>{stats.collections}</dd>
              <dt>标签</dt>
              <dd>{stats.tags}</dd>
              <dt>未分类</dt>
              <dd>{stats.uncategorized}</dd>
              <dt>服务运行</dt>
              <dd>
                {Math.floor(status.uptimeSeconds / 3600)} 小时 {Math.floor((status.uptimeSeconds % 3600) / 60)} 分（Node {status.node}）
              </dd>
            </dl>
          </div>

          <div className="panel">
            <h3>仓库数据布局</h3>
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
            >{`meta.json            仓库元信息
collections.json     收藏夹
links/0000.jsonl     链接分片（每片 1000 条，每行一条记录）
archives/<id>.html.gz 网页存档（gzip 压缩的完整 HTML）`}</pre>
            <div className="field-hint" style={{ marginTop: 10 }}>
              直接编辑文件后提交推送，服务会自动拉取并加载；两端同时修改时按 id 合并，更新时间较新的记录优先。
            </div>
          </div>

          {status.warnings.length > 0 && (
            <div className="panel">
              <h3>数据解析警告</h3>
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
